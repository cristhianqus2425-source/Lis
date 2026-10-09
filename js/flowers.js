// =====================================================================
//  flowers.js — Ramo de flores 3D generado proceduralmente
//  Tipos: tulipanes, lirios ("lis") y ramitas de lavanda, atados con un lazo.
//
//  Para rendimiento, todos los elementos repetidos (pétalos, hojas, estambres,
//  botones de lavanda) se dibujan con InstancedMesh: un solo draw call por tipo.
//  Cada flor mantiene una pequeña jerarquía de Object3D "fantasma" (sin malla)
//  que usamos para calcular las matrices de cada instancia en cada frame.
// =====================================================================
import * as THREE from 'three';

// ---------- utilidades ----------

// Generador pseudoaleatorio con semilla: el ramo siempre sale igual de bonito
function crearAzar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c1 = 1.5, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Añade a un material estándar un brillo de borde (fresnel) lila y una
 * falsa translucidez, para que los pétalos "brillen" en los contornos.
 */
export function agregarBrilloPetalo(material, colorBorde = '#c99bff', fuerza = 0.9, translucidez = 0.16) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uColorBorde = { value: new THREE.Color(colorBorde) };
    shader.uniforms.uFuerzaBorde = { value: fuerza };
    shader.uniforms.uTranslucidez = { value: translucidez };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uColorBorde;\nuniform float uFuerzaBorde;\nuniform float uTranslucidez;'
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Fresnel: más brillo cuanto más de canto vemos la superficie
        float fresnel = pow(clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += uColorBorde * fresnel * uFuerzaBorde;
        // Translucidez falsa: el pétalo deja "pasar" un poco de su propio color
        totalEmissiveRadiance += diffuseColor.rgb * uTranslucidez;`
      );
  };
  material.customProgramCacheKey = () => `petalo-${colorBorde}-${fuerza}-${translucidez}`;
  return material;
}

/**
 * Material "de verdad" para los pétalos:
 *  - MeshPhysicalMaterial con sheen (aspecto aterciopelado, como un pétalo real)
 *  - venas finas que nacen en la base
 *  - motitas oscuras cerca del centro (típicas del lirio), opcional
 *  - gotitas de rocío que destellan con el tiempo (las recoge el bloom)
 *  - brillo de borde (fresnel) y falsa translucidez
 * La geometría debe tener el atributo `aUvPetalo` (copia de uv).
 */
export function crearMaterialPetalo({ tiempo, manchas = false, venas = 9, rocio = 0.012, colorBorde = '#c99bff', sheen = '#f3dcff' } = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.48,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(sheen),
    specularIntensity: 0.6,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTiempo = tiempo;
    shader.uniforms.uColorBorde = { value: new THREE.Color(colorBorde) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUvPetalo;\nvarying vec2 vUvP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvP = aUvPetalo;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTiempo;
        uniform vec3 uColorBorde;
        varying vec2 vUvP;
        float hashP(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float uP = vUvP.x * 2.0 - 1.0;
        float vP = vUvP.y;
        // Venas: líneas finas a lo largo del pétalo, más marcadas en la base
        float lineas = abs(fract(uP * ${(venas / 2).toFixed(1)} + 0.5) - 0.5) * 2.0;
        float vena = (1.0 - smoothstep(0.0, 0.22, lineas)) * (1.0 - vP * 0.75);
        diffuseColor.rgb *= 1.0 - vena * 0.22;
        // Nervio central un poco más claro
        diffuseColor.rgb *= 1.0 + (1.0 - smoothstep(0.0, 0.06, abs(uP))) * 0.12 * (1.0 - vP);
        ${manchas ? `
        // Motitas del lirio
        vec2 celda = vUvP * vec2(13.0, 24.0);
        vec2 idC = floor(celda);
        float azarC = hashP(idC);
        float mota = step(0.78, azarC) * (1.0 - smoothstep(0.14, 0.34, length(fract(celda) - 0.5)));
        mota *= (1.0 - smoothstep(0.12, 0.5, vP)) * step(0.06, vP) * (1.0 - smoothstep(0.4, 0.8, abs(uP)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.03, 0.22), mota * 0.9);` : ''}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fresnel = pow(clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.4);
        totalEmissiveRadiance += uColorBorde * fresnel * 0.75;
        totalEmissiveRadiance += diffuseColor.rgb * 0.14;
        // Gotitas de rocío que titilan
        vec2 celdaR = vUvP * vec2(22.0, 36.0);
        vec2 idR = floor(celdaR);
        float azarR = hashP(idR + 7.0);
        float gota = step(1.0 - ${rocio.toFixed(3)}, azarR) * (1.0 - smoothstep(0.0, 0.22, length(fract(celdaR) - 0.5)));
        float destello = pow(0.5 + 0.5 * sin(uTiempo * (1.5 + azarR * 3.0) + azarR * 60.0), 6.0);
        totalEmissiveRadiance += vec3(1.0, 0.95, 1.0) * gota * (0.6 + destello * 3.5);`
      );
  };
  material.customProgramCacheKey = () => `petaloFisico-${manchas}-${venas}-${rocio}-${colorBorde}`;
  return material;
}

/**
 * Papel de envoltura del ramo: un cono abierto adelante, con borde ondulado
 * y arrugas suaves. `desde`/`hasta` son ángulos (0 = frente).
 */
function crearGeometriaPapel({ desde, hasta, alto, radioTope, colores, ondas = 5, fase = 0, segT = 64, segY = 22 }) {
  const posiciones = [], colorArr = [], uvs = [], indices = [];
  const cBajo = new THREE.Color(colores[0]), cAlto = new THREE.Color(colores[1]);
  const c = new THREE.Color();
  const yBase = -0.62; // el papel termina justo bajo el lazo; abajo se ven los tallos
  for (let j = 0; j <= segY; j++) {
    const s = j / segY;
    for (let i = 0; i <= segT; i++) {
      const u = i / segT;
      const th = desde + (hasta - desde) * u;
      // Borde superior ondulado (como papel plegado)
      const tope = alto + 0.11 * Math.sin(ondas * th + fase) + 0.04 * Math.sin(13 * th + fase * 2);
      const y = yBase + (tope - yBase) * s;
      const sobre = Math.max(0, y);
      let r = y < 0 ? 0.22 + 0.05 * -y : 0.22 + (radioTope - 0.22) * Math.pow(sobre / alto, 1.3);
      // Arrugas y pliegues verticales
      r += (0.03 * Math.sin(th * 19 + y * 3 + fase) + 0.018 * Math.sin(th * 41 - y * 5)) * Math.min(1, sobre / 0.4 + 0.15);
      // Los extremos del papel se abren un poquito hacia afuera
      const borde = Math.min(u, 1 - u);
      r += (1 - Math.min(1, borde / 0.08)) * 0.05 * Math.min(1, sobre);
      posiciones.push(Math.sin(th) * r, y, Math.cos(th) * r);
      c.lerpColors(cBajo, cAlto, Math.pow(s, 0.8));
      colorArr.push(c.r, c.g, c.b);
      uvs.push(u, s);
    }
  }
  const fila = segT + 1;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segT; i++) {
      const a = j * fila + i, b = a + 1, d = a + fila, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Geometría de un pétalo curvado, con degradado de color base→punta.
 * Incluye un "morph target" con la forma abierta (punta arqueada hacia afuera),
 * así cada pétalo cambia de forma mientras se abre.
 *
 * Sistema local: la base del pétalo está en el origen, crece hacia +Y,
 * y su cara cóncava mira hacia -Z (el centro de la flor).
 */
function crearGeometriaPetalo(o) {
  const geo = new THREE.PlaneGeometry(1, 1, o.segX, o.segY);
  const pos = geo.attributes.position;
  const abierta = new Float32Array(pos.count * 3);
  const colores = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color(o.colores[0]);
  const cMedio = new THREE.Color(o.colores[1]);
  const cPunta = new THREE.Color(o.colores[2]);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);        // -0.5 … 0.5 (a lo ancho)
    const v = pos.getY(i) + 0.5;  //  0 … 1   (de la base a la punta)
    const xn = u * 2;
    const anchoLocal = o.perfil(v) * o.ancho;
    const x = u * anchoLocal;
    const y = v * o.largo;

    // Copa: los bordes se curvan hacia el centro; panza: el centro se abomba hacia afuera
    const copa = -o.copa * xn * xn * anchoLocal;
    const panza = o.panza * Math.sin(Math.PI * v) * o.largo;
    // Leve ondulación del borde para que no se vea "de plástico"
    const onda = Math.sin(v * Math.PI * o.ondas + xn * 2.0) * o.ondulacion * Math.abs(xn) * o.largo;

    // Forma cerrada: la punta se recoge un poco hacia adentro
    const zCerrada = copa + panza - o.arqueoCerrado * v * v * o.largo + onda;
    // Forma abierta: copa más suave y la punta arqueada hacia afuera
    const arqueo = o.arqueoAbierto * Math.pow(v, 2.2) * o.largo;
    const zAbierta = copa * o.copaAbierta + panza * 0.6 + arqueo + onda;
    const yAbierta = y - arqueo * 0.45 * v;

    pos.setXYZ(i, x, y, zCerrada);
    abierta[i * 3] = x;
    abierta[i * 3 + 1] = yAbierta;
    abierta[i * 3 + 2] = zAbierta;

    // Degradado de tres colores + bordes un poquito más claros
    if (v < o.puntoMedio) c.lerpColors(cBase, cMedio, v / o.puntoMedio);
    else c.lerpColors(cMedio, cPunta, (v - o.puntoMedio) / (1 - o.puntoMedio));
    const claro = 1 + Math.abs(xn) * o.bordeClaro;
    colores[i * 3] = c.r * claro;
    colores[i * 3 + 1] = c.g * claro;
    colores[i * 3 + 2] = c.b * claro;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.setAttribute('aUvPetalo', geo.attributes.uv.clone()); // para venas, motas y rocío
  geo.computeVertexNormals();

  // Normales de la forma abierta, para que la luz sea correcta durante el morph
  const geoAbierta = new THREE.BufferGeometry();
  geoAbierta.setAttribute('position', new THREE.BufferAttribute(abierta, 3));
  geoAbierta.setIndex(geo.index);
  geoAbierta.computeVertexNormals();

  geo.morphAttributes.position = [new THREE.BufferAttribute(abierta, 3)];
  geo.morphAttributes.normal = [geoAbierta.attributes.normal];
  return geo;
}

/** Hoja alargada, doblada por la nervadura central y arqueada. */
function crearGeometriaHoja() {
  const geo = new THREE.PlaneGeometry(1, 1, 4, 14);
  const pos = geo.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color('#2f5d34');
  const cPunta = new THREE.Color('#6fa86a');
  const c = new THREE.Color();
  const largo = 1.0, ancho = 0.16;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i) + 0.5;
    const perfil = Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.8) * (1 - 0.2 * v);
    const x = u * ancho * perfil;
    const y = v * largo;
    const z = -Math.abs(u) * 0.12 * perfil + 0.35 * v * v; // pliegue en V + arqueo
    pos.setXYZ(i, x, y - 0.12 * v * v, z);
    c.lerpColors(cBase, cPunta, v);
    const nervio = 1 - 0.25 * (1 - Math.abs(u * 2)); // nervadura central más oscura
    colores[i * 3] = c.r * nervio; colores[i * 3 + 1] = c.g * nervio; colores[i * 3 + 2] = c.b * nervio;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Cinta plana que sigue una curva. El ancho se orienta lo más parecido
 * posible al vector `direccionAncho`, perpendicular a la curva.
 */
function crearGeometriaCinta(curva, ancho, segmentos, direccionAncho) {
  const posiciones = [];
  const indices = [];
  const t = new THREE.Vector3(), w = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i <= segmentos; i++) {
    const s = i / segmentos;
    curva.getPointAt(s, p);
    curva.getTangentAt(s, t);
    w.copy(direccionAncho).addScaledVector(t, -t.dot(direccionAncho)).normalize();
    // La cinta se angosta un poquito en los extremos de las colas
    const a = ancho * 0.5;
    posiciones.push(p.x - w.x * a, p.y - w.y * a, p.z - w.z * a, p.x + w.x * a, p.y + w.y * a, p.z + w.z * a);
    if (i < segmentos) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------- definición de cada tipo de flor ----------

const TIPOS = {
  tulipan: {
    petalo: {
      largo: 0.6, ancho: 0.5, segX: 6, segY: 10,
      perfil: (v) => Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * v)), 0.65) * (0.55 + 0.45 * v),
      copa: 0.42, copaAbierta: 0.75, panza: 0.2, ondas: 1.5, ondulacion: 0.01,
      arqueoCerrado: 0.06, arqueoAbierto: 0.32,
      colores: ['#2a0f3d', '#7b3fb5', '#d7a8f5'], puntoMedio: 0.45, bordeClaro: 0.18,
    },
    // [ángulo en Y, radio, escala, ángulo cerrado, ángulo abierto]
    verticilos: [
      { n: 3, desfase: 0, radio: 0.035, escala: 1.0, cerrado: -0.16, abierto: 0.62 },
      { n: 3, desfase: Math.PI / 3, radio: 0.02, escala: 0.92, cerrado: -0.2, abierto: 0.36 },
    ],
  },
  lirio: {
    petalo: {
      largo: 0.8, ancho: 0.3, segX: 6, segY: 12,
      perfil: (v) => Math.pow(Math.sin(Math.PI * v), 1.05) * (1 - 0.3 * v) + 0.06 * (1 - v),
      copa: 0.3, copaAbierta: 0.55, panza: 0.06, ondas: 3, ondulacion: 0.012,
      arqueoCerrado: 0.02, arqueoAbierto: 0.85,
      colores: ['#f3e2ff', '#b57edc', '#6a2fa3'], puntoMedio: 0.35, bordeClaro: 0.22,
    },
    verticilos: [
      { n: 3, desfase: 0, radio: 0.03, escala: 1.0, cerrado: -0.07, abierto: 1.05 },
      { n: 3, desfase: Math.PI / 3, radio: 0.02, escala: 0.9, cerrado: -0.09, abierto: 0.92 },
    ],
  },
};

// ---------- el ramo ----------

export class Ramo {
  /**
   * @param {object} opciones
   *  - calidad: 'alta' | 'baja' (menos segmentos en móviles lentos)
   *  - movimientoReducido: brisa más suave
   */
  constructor({ calidad = 'alta', movimientoReducido = false } = {}) {
    this.calidad = calidad;
    this.movimientoReducido = movimientoReducido;
    this.grupo = new THREE.Group();          // todo el ramo (se balancea un poco)
    this.grupo.position.y = -0.65;
    this.flores = [];
    this.tiempo = 0;                          // reloj del florecimiento
    this.activo = false;                      // ¿empezó el florecimiento?
    this.promesas = [];                       // { t, resolver } para esperar momentos del timeline
    this.azar = crearAzar(2026);
    this.tiempoShader = { value: 0 };         // reloj compartido por los shaders (rocío)

    this.#crearMateriales();
    this.#crearFlores();
    this.#crearInstancias();
    this.#crearLazo();
    this.#crearPapel();
    this.reiniciar();
  }

  #crearMateriales() {
    this.matTulipan = crearMaterialPetalo({ tiempo: this.tiempoShader, venas: 11, rocio: 0.014 });
    this.matLirio = crearMaterialPetalo({ tiempo: this.tiempoShader, manchas: true, venas: 7, rocio: 0.01, colorBorde: '#e2bcff' });
    this.matTallo = new THREE.MeshStandardMaterial({ color: '#3f7a46', roughness: 0.7 });
    this.matHoja = agregarBrilloPetalo(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }),
      '#9ad08a', 0.25, 0.06
    );
    this.matEstambre = new THREE.MeshStandardMaterial({ color: '#d9e6b0', roughness: 0.6 });
    this.matAntera = new THREE.MeshStandardMaterial({ color: '#f5b45a', emissive: '#7a3d08', emissiveIntensity: 0.6, roughness: 0.5 });
    this.matLavanda = agregarBrilloPetalo(
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      '#d6a8ff', 0.6, 0.12
    );
    // Cinta de satén dorado: brillo suave + reflejos del entorno
    this.matLazo = new THREE.MeshPhysicalMaterial({
      color: '#f2cf86', metalness: 0.25, roughness: 0.26, sheen: 1, sheenColor: new THREE.Color('#fff2cc'), sheenRoughness: 0.3,
      clearcoat: 0.5, clearcoatRoughness: 0.2, emissive: '#6b4a14', emissiveIntensity: 0.3, side: THREE.DoubleSide,
    });
    // Papel de envoltura: capa interior color ciruela y capa exterior tipo organza translúcida
    this.matPapelInterior = new THREE.MeshPhysicalMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, sheen: 0.6, sheenColor: new THREE.Color('#c9a0ff'),
    });
    this.matPapelExterior = new THREE.MeshPhysicalMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.4, sheen: 1, sheenColor: new THREE.Color('#ffffff'),
      transparent: true, opacity: 0.62, depthWrite: false, emissive: '#2a0f3d', emissiveIntensity: 0.1,
    });
  }

  /** Distribuye las cabezas de las flores en una cúpula (espiral de Fibonacci). */
  #crearFlores() {
    const azar = this.azar;
    const N = this.calidad === 'baja' ? 20 : 27;
    const anguloDorado = Math.PI * (3 - Math.sqrt(5));
    const segTubo = this.calidad === 'baja' ? 16 : 28;

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const polar = 0.82 * Math.sqrt(t) + (azar() - 0.5) * 0.08;
      const azimut = i * anguloDorado + (azar() - 0.5) * 0.3;

      // Asignar tipo: lirios repartidos, lavanda en el borde, el resto tulipanes
      let tipo = 'tulipan';
      if (i % 4 === 1) tipo = 'lirio';
      else if (polar > 0.5 && i % 3 === 0) tipo = 'lavanda';
      else if (polar > 0.35 && i % 5 === 3) tipo = 'nube'; // flor de nube (gypsophila) de relleno

      const dir = new THREE.Vector3(
        Math.sin(polar) * Math.cos(azimut),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimut)
      );
      const largo = (tipo === 'lavanda' ? 2.1 : 1.75) + azar() * 0.25 - polar * 0.12;

      // Curva del tallo: sale de abajo, cruza por el nudo y se abre hacia la flor
      const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((azar() - 0.5) * 0.18);
      const puntos = [
        new THREE.Vector3(-dir.x * 0.32 + (azar() - 0.5) * 0.1, -1.3, -dir.z * 0.32 + (azar() - 0.5) * 0.1),
        new THREE.Vector3((azar() - 0.5) * 0.06, 0, (azar() - 0.5) * 0.06),
        dir.clone().multiplyScalar(largo * 0.5).add(lateral),
        dir.clone().multiplyScalar(largo),
      ];
      const curva = new THREE.CatmullRomCurve3(puntos, false, 'centripetal');

      // Grupo de la flor: su origen es el nudo del ramo, así se balancea desde ahí
      const grupoFlor = new THREE.Group();
      this.grupo.add(grupoFlor);

      // Tallo (TubeGeometry sobre la curva Catmull-Rom)
      const radio = tipo === 'lavanda' || tipo === 'nube' ? 0.012 : 0.021;
      const tallo = new THREE.Mesh(new THREE.TubeGeometry(curva, segTubo, radio, 6, false), this.matTallo);
      grupoFlor.add(tallo);

      // Cabeza orientada según la tangente final del tallo
      const cabeza = new THREE.Object3D();
      cabeza.position.copy(curva.getPointAt(1));
      cabeza.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curva.getTangentAt(1));
      cabeza.rotateY(azar() * Math.PI * 2);
      const escala = tipo === 'lavanda' || tipo === 'nube' ? 1 : 0.85 + azar() * 0.3;
      cabeza.scale.setScalar(escala);
      grupoFlor.add(cabeza);

      // Tono propio de cada flor (multiplica el degradado del pétalo)
      const tinte = new THREE.Color().setHSL(0.76 + (azar() - 0.5) * 0.12, 0.55, 0.86 + azar() * 0.1);

      const flor = {
        tipo, grupo: grupoFlor, cabeza, curva, tinte,
        fase: azar() * Math.PI * 2,
        retraso: 0, crecimiento: 0, apertura: 0,
        petalos: [], hojas: [], estambres: [], botones: [],
      };

      if (tipo === 'lavanda') this.#armarLavanda(flor);
      else if (tipo === 'nube') this.#armarNube(flor);
      else this.#armarFlor(flor);
      this.#armarHojas(flor);
      this.flores.push(flor);
    }

    // Orden del florecimiento: primero el centro, luego hacia afuera (cascada)
    this.flores.forEach((f, i) => {
      f.retraso = i * (3.0 / this.flores.length) + this.azar() * 0.1;
    });
  }

  #armarFlor(flor) {
    const def = TIPOS[flor.tipo];
    for (const vert of def.verticilos) {
      for (let k = 0; k < vert.n; k++) {
        const pivote = new THREE.Object3D();
        pivote.rotation.y = vert.desfase + (k / vert.n) * Math.PI * 2 + (this.azar() - 0.5) * 0.15;
        const petalo = new THREE.Object3D();
        petalo.position.z = vert.radio;
        petalo.scale.setScalar(vert.escala * (0.94 + this.azar() * 0.12));
        pivote.add(petalo);
        flor.cabeza.add(pivote);
        flor.petalos.push({
          objeto: petalo,
          cerrado: vert.cerrado,
          abierto: vert.abierto + (this.azar() - 0.5) * 0.12,
          retraso: flor.petalos.length * 0.09, // se abren uno a uno
          fase: this.azar() * Math.PI * 2,
          morph: { morphTargetInfluences: [0] },
        });
      }
    }
    if (flor.tipo === 'lirio') {
      // Seis estambres con anteras doradas y un pistilo
      for (let k = 0; k < 7; k++) {
        const pivote = new THREE.Object3D();
        pivote.rotation.y = (k / 6) * Math.PI * 2;
        const estambre = new THREE.Object3D();
        estambre.rotation.x = k === 6 ? 0 : 0.32 + this.azar() * 0.1;
        pivote.add(estambre);
        flor.cabeza.add(pivote);
        const antera = new THREE.Object3D();
        antera.position.y = 0.48;
        estambre.add(antera);
        flor.estambres.push({ objeto: estambre, antera, pistilo: k === 6 });
      }
    }
  }

  #armarLavanda(flor) {
    // Espiga: botones en verticilos de 4 que se achican hacia la punta
    const niveles = this.calidad === 'baja' ? 6 : 8;
    for (let n = 0; n < niveles; n++) {
      const h = n / (niveles - 1);
      for (let k = 0; k < 4; k++) {
        const boton = new THREE.Object3D();
        const ang = k * (Math.PI / 2) + n * 0.7;
        const r = 0.06 * (1 - h * 0.5);
        boton.position.set(Math.cos(ang) * r, -0.05 + h * 0.7, Math.sin(ang) * r);
        boton.rotation.set(Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5);
        flor.cabeza.add(boton);
        const color = new THREE.Color().setHSL(0.74 + (this.azar() - 0.5) * 0.04, 0.55, 0.42 + h * 0.18 + this.azar() * 0.05);
        flor.botones.push({ objeto: boton, nivel: h, escalaBase: 1 - h * 0.35, color });
      }
    }
  }

  /** Flor de nube: un pequeño domo de florcitas blancas-lila. */
  #armarNube(flor) {
    const n = this.calidad === 'baja' ? 16 : 26;
    for (let k = 0; k < n; k++) {
      const boton = new THREE.Object3D();
      const a = this.azar() * Math.PI * 2, p = Math.sqrt(this.azar()) * 1.2;
      const r = 0.2;
      boton.position.set(Math.sin(p) * Math.cos(a) * r, Math.cos(p) * r * 0.7 - 0.02, Math.sin(p) * Math.sin(a) * r);
      boton.scale.set(0.7, 0.55, 0.7);
      flor.cabeza.add(boton);
      const color = new THREE.Color().setHSL(0.78 + (this.azar() - 0.5) * 0.05, 0.6, 0.86 + this.azar() * 0.1);
      flor.botones.push({ objeto: boton, nivel: this.azar(), escalaBase: 0.55 + this.azar() * 0.35, color });
    }
  }

  #armarHojas(flor) {
    const cantidad = flor.tipo === 'lavanda' || flor.tipo === 'nube' ? 0 : flor.tipo === 'tulipan' ? 2 : 1;
    for (let k = 0; k < cantidad; k++) {
      const t = 0.42 + k * 0.12 + this.azar() * 0.05;
      const hoja = new THREE.Object3D();
      hoja.position.copy(flor.curva.getPointAt(t));
      const tangente = flor.curva.getTangentAt(t);
      hoja.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangente);
      hoja.rotateY(k * Math.PI + this.azar() * 1.2);
      hoja.rotateX(0.35 + this.azar() * 0.2);
      const escala = 0.75 + this.azar() * 0.35;
      flor.grupo.add(hoja);
      flor.hojas.push({ objeto: hoja, escala });
    }
  }

  /** Crea un InstancedMesh por tipo de elemento repetido. */
  #crearInstancias() {
    const contar = (fn) => this.flores.reduce((n, f) => n + fn(f), 0);
    const alta = this.calidad !== 'baja';

    this.geos = {
      tulipan: crearGeometriaPetalo({ ...TIPOS.tulipan.petalo, segX: alta ? 6 : 4, segY: alta ? 10 : 7 }),
      lirio: crearGeometriaPetalo({ ...TIPOS.lirio.petalo, segX: alta ? 6 : 4, segY: alta ? 12 : 8 }),
    };

    const crear = (geo, mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; // las instancias cambian de lugar; no recortar por la caja original
      return m;
    };

    this.instTulipan = crear(this.geos.tulipan, this.matTulipan, contar((f) => (f.tipo === 'tulipan' ? f.petalos.length : 0)));
    this.instLirio = crear(this.geos.lirio, this.matLirio, contar((f) => (f.tipo === 'lirio' ? f.petalos.length : 0)));
    this.instHoja = crear(crearGeometriaHoja(), this.matHoja, contar((f) => f.hojas.length));
    const nEstambres = contar((f) => f.estambres.length);
    this.instEstambre = crear(new THREE.CylinderGeometry(0.006, 0.008, 0.48, 5, 1).translate(0, 0.24, 0), this.matEstambre, nEstambres);
    this.instAntera = crear(new THREE.SphereGeometry(1, 8, 6).scale(0.022, 0.04, 0.022), this.matAntera, nEstambres);
    this.instBoton = crear(new THREE.SphereGeometry(1, 8, 6).scale(0.042, 0.06, 0.042), this.matLavanda, contar((f) => f.botones.length));

    // Colores por instancia (tono de cada flor)
    let iT = 0, iL = 0, iB = 0;
    for (const f of this.flores) {
      for (const p of f.petalos) {
        if (f.tipo === 'tulipan') { p.inst = this.instTulipan; p.indice = iT++; }
        else { p.inst = this.instLirio; p.indice = iL++; }
        p.inst.setColorAt(p.indice, f.tinte);
        p.inst.setMorphAt(p.indice, p.morph);
      }
      for (const b of f.botones) { b.indice = iB; this.instBoton.setColorAt(iB++, b.color); }
    }
    const verdeTmp = new THREE.Color();
    let iH = 0;
    for (const f of this.flores) for (const h of f.hojas) {
      verdeTmp.setHSL(0.3 + (this.azar() - 0.5) * 0.05, 0.4, 0.9 + this.azar() * 0.1);
      this.instHoja.setColorAt(iH++, verdeTmp);
    }

    this.instancias = [this.instTulipan, this.instLirio, this.instHoja, this.instEstambre, this.instAntera, this.instBoton];
    // Las instancias viven en la raíz del ramo; sus matrices ya incluyen todo
    this.contenedorInstancias = new THREE.Group();
    this.contenedorInstancias.add(...this.instancias);
  }

  /** Lazo dorado: banda alrededor de los tallos, nudo (TubeGeometry), dos lazadas y dos colas. */
  #crearLazo() {
    const lazo = new THREE.Group();
    const banda = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.24, 0.2, 40, 1, true), this.matLazo);
    lazo.add(banda);

    const frente = new THREE.Group();
    frente.position.set(0, 0, 0.25);
    lazo.add(frente);

    // Nudo: un pequeño anillo hecho con TubeGeometry
    const curvaNudo = new THREE.EllipseCurve(0, 0, 0.05, 0.065);
    const puntosNudo = curvaNudo.getPoints(24).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const nudo = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(puntosNudo, true), 32, 0.03, 8, true),
      this.matLazo
    );
    nudo.position.z = 0.03;
    frente.add(nudo);

    // Lazadas (izquierda y derecha)
    for (const lado of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const s = (i / 24) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          lado * 0.24 * (1 - Math.cos(s)),
          0.15 * (1 - Math.cos(s)) + 0.05 * Math.sin(s),
          0.1 * Math.sin(s) + 0.03
        ));
      }
      const curva = new THREE.CatmullRomCurve3(pts, true);
      const lazada = new THREE.Mesh(crearGeometriaCinta(curva, 0.11, 60, new THREE.Vector3(-lado * 0.5, 1, 0.2)), this.matLazo);
      lazada.rotation.z = lado * -0.12;
      frente.add(lazada);

      // Cola que cae ondulando
      const cola = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0.03),
        new THREE.Vector3(lado * 0.07, -0.2, 0.06),
        new THREE.Vector3(lado * 0.12, -0.42, 0.03),
        new THREE.Vector3(lado * 0.2, -0.66, 0.07),
      ]);
      frente.add(new THREE.Mesh(crearGeometriaCinta(cola, 0.075, 30, new THREE.Vector3(1, 0, 0.2)), this.matLazo));
    }
    this.lazo = lazo;
    this.grupo.add(lazo);
  }

  /** Papel de envoltura en dos capas, abierto hacia el frente. */
  #crearPapel() {
    const papel = new THREE.Group();
    const seg = this.calidad === 'baja' ? 40 : 64;
    const interior = new THREE.Mesh(crearGeometriaPapel({
      desde: 0.32, hasta: Math.PI * 2 - 0.32, alto: 0.95, radioTope: 1.3,
      colores: ['#2a0f3d', '#6a3399'], ondas: 6, fase: 0.6, segT: seg,
    }), this.matPapelInterior);
    const exterior = new THREE.Mesh(crearGeometriaPapel({
      desde: 0.62, hasta: Math.PI * 2 - 0.62, alto: 1.22, radioTope: 1.62,
      colores: ['#7f52b8', '#d9c2f4'], ondas: 5, fase: 2.1, segT: seg,
    }), this.matPapelExterior);
    exterior.renderOrder = 2;
    papel.add(interior, exterior);
    this.papel = papel;
    this.grupo.add(papel);
  }

  /** Agrega el ramo y sus instancias a la escena. */
  agregarA(escena) {
    escena.add(this.grupo);
    escena.add(this.contenedorInstancias);
  }

  /** Vuelve al estado inicial: tallos sin crecer y flores cerradas. */
  reiniciar() {
    this.tiempo = 0;
    this.activo = false;
    this.promesas = [];
    this.actualizar(0, 0);
  }

  /** Empieza el florecimiento. */
  florecer() {
    this.reiniciar();
    this.activo = true;
  }

  /** Promesa que se resuelve cuando el timeline del florecimiento llega a `segundos`. */
  esperarHasta(segundos) {
    return new Promise((resolver) => this.promesas.push({ t: segundos, resolver }));
  }

  /** Avance del florecimiento entre 0 y 1. */
  get progreso() {
    return clamp01(this.tiempo / this.duracion);
  }

  /** Duración aproximada del florecimiento completo (s). */
  get duracion() {
    return this.flores[this.flores.length - 1].retraso + 1.2 + 2.4;
  }

  /**
   * Actualiza crecimiento, apertura, brisa y "respiración".
   * @param {number} dt  delta de tiempo (s)
   * @param {number} t   tiempo global (s), para el movimiento continuo
   */
  actualizar(dt, t) {
    if (this.activo) this.tiempo += dt;
    const T = this.tiempo;
    const suavidad = this.movimientoReducido ? 0.45 : 1;

    // Resolver promesas de momentos del timeline
    if (this.promesas.length) {
      this.promesas = this.promesas.filter((p) => (T >= p.t ? (p.resolver(), false) : true));
    }

    // El ramo entero sube desde abajo y se mece apenas
    const subida = easeOutCubic(clamp01(T / 1.6));
    this.grupo.position.y = -0.65 - (1 - subida) * 0.8;
    this.grupo.rotation.z = Math.sin(t * 0.5) * 0.015 * suavidad;
    this.grupo.rotation.x = Math.sin(t * 0.37 + 1) * 0.01 * suavidad;
    this.lazo.scale.setScalar(Math.max(0.001, easeOutBack(clamp01((T - 0.9) / 0.9))));
    const papel = easeOutCubic(clamp01((T - 0.15) / 1.5));
    this.papel.scale.set(Math.max(0.001, papel), Math.max(0.001, papel), Math.max(0.001, papel));
    this.tiempoShader.value = t;

    for (const f of this.flores) {
      // 1) Crecimiento del tallo (desde el nudo hacia afuera)
      f.crecimiento = easeOutCubic(clamp01((T - f.retraso * 0.5) / 1.4));
      f.grupo.scale.setScalar(Math.max(0.001, f.crecimiento));

      // 2) Brisa: balanceo con desfase propio
      f.grupo.rotation.z = Math.sin(t * 0.9 + f.fase) * 0.035 * suavidad;
      f.grupo.rotation.x = Math.sin(t * 0.7 + f.fase * 1.7) * 0.025 * suavidad;

      // 3) Apertura en cascada, pétalo a pétalo
      const inicio = 1.0 + f.retraso;
      for (const p of f.petalos) {
        const a = easeInOutCubic(clamp01((T - inicio - p.retraso) / 2.0));
        const respira = Math.sin(t * 1.6 + p.fase) * 0.035 * a * suavidad;
        p.objeto.rotation.x = lerp(p.cerrado, p.abierto, a) + respira;
        p.morph.morphTargetInfluences[0] = a;
      }
      f.apertura = easeInOutCubic(clamp01((T - inicio) / 2.4));

      for (const e of f.estambres) {
        const s = Math.max(0.001, easeOutCubic(clamp01((f.apertura - 0.35) / 0.65)));
        e.objeto.scale.set(s, s * (e.pistilo ? 1.05 : 1), s);
      }
      for (const b of f.botones) {
        const s = easeOutBack(clamp01(f.apertura * 1.6 - b.nivel * 0.6));
        b.objeto.scale.setScalar(Math.max(0.001, s * b.escalaBase));
      }
      for (const h of f.hojas) {
        h.objeto.scale.setScalar(Math.max(0.001, h.escala * easeOutCubic(clamp01((T - f.retraso * 0.5 - 0.3) / 1.4))));
      }
    }

    // Recalcular matrices y copiarlas a las instancias
    this.grupo.updateMatrixWorld(true);
    for (const f of this.flores) {
      for (const p of f.petalos) {
        p.inst.setMatrixAt(p.indice, p.objeto.matrixWorld);
        p.inst.setMorphAt(p.indice, p.morph);
      }
      for (const b of f.botones) this.instBoton.setMatrixAt(b.indice, b.objeto.matrixWorld);
    }
    let iH = 0, iE = 0;
    for (const f of this.flores) {
      for (const h of f.hojas) this.instHoja.setMatrixAt(iH++, h.objeto.matrixWorld);
      for (const e of f.estambres) {
        this.instEstambre.setMatrixAt(iE, e.objeto.matrixWorld);
        this.instAntera.setMatrixAt(iE++, e.antera.matrixWorld);
      }
    }
    for (const m of this.instancias) {
      m.instanceMatrix.needsUpdate = true;
      if (m.morphTexture) m.morphTexture.needsUpdate = true;
    }
  }
}
