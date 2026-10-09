// =====================================================================
//  particles.js — Estrellas, pétalos que caen, luciérnagas y explosiones
//  de brillos al tocar la pantalla.
//  Todo usa InstancedMesh o Points: un draw call por sistema.
// =====================================================================
import * as THREE from 'three';

/**
 * Brillo de borde (fresnel) lila y falsa translucidez para los pétalos.
 */
function agregarBrilloPetalo(material, colorBorde = '#c99bff', fuerza = 0.9, translucidez = 0.16) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uColorBorde = { value: new THREE.Color(colorBorde) };
    shader.uniforms.uFuerzaBorde = { value: fuerza };
    shader.uniforms.uTranslucidez = { value: translucidez };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uColorBorde;\nuniform float uFuerzaBorde;\nuniform float uTranslucidez;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fresnel = pow(clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += uColorBorde * fresnel * uFuerzaBorde;
        totalEmissiveRadiance += diffuseColor.rgb * uTranslucidez;`
      );
  };
  material.customProgramCacheKey = () => `petalo-${colorBorde}-${fuerza}-${translucidez}`;
  return material;
}

const PALETA_PETALOS = ['#7b3fb5', '#9a5cd0', '#b57edc', '#cfa2ee', '#e6ccff', '#c58bd8'];

/** Pétalo pequeño, curvado, con degradado. */
function crearGeometriaPetalito() {
  const geo = new THREE.PlaneGeometry(1, 1, 3, 4);
  const pos = geo.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i) + 0.5;
    const perfil = Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * v)), 0.7);
    pos.setXYZ(i, u * 0.11 * perfil, (v - 0.5) * 0.16, -u * u * 0.06 + Math.sin(v * Math.PI) * 0.015);
    const k = 0.6 + 0.4 * v; // base más oscura
    colores[i * 3] = k; colores[i * 3 + 1] = k; colores[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Textura procedimental de un punto brillante suave (se dibuja en el shader). */
const shaderPuntoVertex = /* glsl */ `
  attribute float aEscala;
  attribute float aFase;
  attribute float aVida;
  uniform float uTiempo;
  uniform float uTamano;
  uniform float uPixelRatio;
  uniform float uDeriva;
  varying float vBrillo;
  void main() {
    vec3 p = position;
    // Deriva suave (luciérnagas). Para estrellas y chispas uDeriva = 0.
    p.x += sin(uTiempo * 0.35 + aFase * 6.28) * uDeriva;
    p.y += sin(uTiempo * 0.5 + aFase * 12.0) * uDeriva * 0.7;
    p.z += cos(uTiempo * 0.3 + aFase * 9.0) * uDeriva;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Parpadeo propio de cada punto
    float parpadeo = 0.55 + 0.45 * sin(uTiempo * (1.2 + aFase * 2.5) + aFase * 40.0);
    vBrillo = parpadeo * aVida;
    gl_PointSize = uTamano * aEscala * uPixelRatio * (0.6 + 0.4 * aVida) / -mv.z;
  }
`;
const shaderPuntoFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vBrillo;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float nucleo = 1.0 - smoothstep(0.0, 0.5, d);
    float alfa = pow(nucleo, 2.2) * vBrillo;
    if (alfa < 0.003) discard;
    gl_FragColor = vec4(uColor * (0.8 + nucleo), alfa);
  }
`;

function crearMaterialPuntos({ color, tamano, deriva = 0, pixelRatio }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTiempo: { value: 0 },
      uTamano: { value: tamano },
      uPixelRatio: { value: pixelRatio },
      uDeriva: { value: deriva },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: shaderPuntoVertex,
    fragmentShader: shaderPuntoFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export class Particulas {
  /**
   * @param {object} o
   *  - cantidades: { estrellas, petalos, luciernagas, explosion, chispas }
   *  - pixelRatio
   *  - movimientoReducido
   */
  constructor(o) {
    this.o = o;
    this.grupo = new THREE.Group();
    this.cayendo = false;     // ¿ya empezó la lluvia de pétalos?
    this.intensidad = 0;      // fundido de entrada de la lluvia (0…1)
    this.limites = { ancho: 12, alto: 10, profundidad: 8 };
    this.dummy = new THREE.Object3D();

    if (this.o.cantidades.estrellas > 0) this.#crearEstrellas();
    this.#crearPetalos();
    this.#crearLuciernagas();
    this.#crearChispas();
  }

  // ---------- estrellas ----------
  #crearEstrellas() {
    const n = this.o.cantidades.estrellas;
    const pos = new Float32Array(n * 3), escala = new Float32Array(n), fase = new Float32Array(n), vida = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Puntos en una esfera lejana (más densos arriba)
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const y = Math.abs(u) * 0.9 + 0.1 * u;
      const r = 55 + Math.random() * 15, s = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * s * r, y * r - 5, Math.sin(th) * s * r], i * 3);
      escala[i] = 0.5 + Math.pow(Math.random(), 4) * 2.5;
      fase[i] = Math.random();
      vida[i] = 0.35 + Math.random() * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEscala', new THREE.BufferAttribute(escala, 1));
    geo.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
    geo.setAttribute('aVida', new THREE.BufferAttribute(vida, 1));
    this.matEstrellas = crearMaterialPuntos({ color: '#efe2ff', tamano: 90, pixelRatio: this.o.pixelRatio });
    this.estrellas = new THREE.Points(geo, this.matEstrellas);
    this.estrellas.frustumCulled = false;
    this.grupo.add(this.estrellas);
  }

  // ---------- pétalos (lluvia + explosiones, en un solo InstancedMesh) ----------
  #crearPetalos() {
    const nCaen = this.o.cantidades.petalos;
    const nExp = this.o.cantidades.explosion;
    const mat = agregarBrilloPetalo(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }),
      '#d9b3ff', 0.6, 0.2
    );
    this.petalos = new THREE.InstancedMesh(crearGeometriaPetalito(), mat, nCaen + nExp);
    this.petalos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.petalos.frustumCulled = false;

    const color = new THREE.Color();
    this.datosPetalos = [];
    for (let i = 0; i < nCaen + nExp; i++) {
      color.set(PALETA_PETALOS[i % PALETA_PETALOS.length]).offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.08);
      this.petalos.setColorAt(i, color);
      const d = {
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        giro: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
        fase: Math.random() * Math.PI * 2,
        escala: 0.8 + Math.random() * 0.7,
        vida: 0, // solo para explosiones
        explosion: i >= nCaen,
      };
      if (!d.explosion) this.#reciclarPetalo(d, true);
      this.datosPetalos.push(d);
    }
    this.grupo.add(this.petalos);
  }

  #reciclarPetalo(d, alAzar = false) {
    const L = this.limites;
    d.pos.set(
      (Math.random() - 0.5) * L.ancho,
      alAzar ? (Math.random() - 0.5) * L.alto : L.alto / 2 + Math.random() * 1.5,
      (Math.random() - 0.5) * L.profundidad - 1
    );
    d.vel.set(0, -(0.25 + Math.random() * 0.3), 0);
  }

  // ---------- luciérnagas ----------
  #crearLuciernagas() {
    const n = this.o.cantidades.luciernagas;
    const pos = new Float32Array(n * 3), escala = new Float32Array(n), fase = new Float32Array(n), vida = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Alrededor de la rosa, en un anillo amplio
      const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 2.4;
      pos.set([Math.cos(a) * r, (Math.random() - 0.3) * 3.6, Math.sin(a) * r * 0.8], i * 3);
      escala[i] = 0.6 + Math.random() * 0.8;
      fase[i] = Math.random();
      vida[i] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEscala', new THREE.BufferAttribute(escala, 1));
    geo.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
    geo.setAttribute('aVida', new THREE.BufferAttribute(vida, 1));
    this.matLuciernagas = crearMaterialPuntos({
      color: '#f5d58a', tamano: 260, deriva: this.o.movimientoReducido ? 0.15 : 0.4, pixelRatio: this.o.pixelRatio,
    });
    this.luciernagas = new THREE.Points(geo, this.matLuciernagas);
    this.luciernagas.frustumCulled = false;
    this.luciernagas.visible = false;
    this.grupo.add(this.luciernagas);
  }

  // ---------- chispas de la explosión ----------
  #crearChispas() {
    const n = this.o.cantidades.chispas;
    this.datosChispas = Array.from({ length: n }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), vida: 0, dur: 1 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aVida', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const escala = new Float32Array(n), fase = new Float32Array(n);
    for (let i = 0; i < n; i++) { escala[i] = 0.5 + Math.random(); fase[i] = Math.random(); }
    geo.setAttribute('aEscala', new THREE.BufferAttribute(escala, 1));
    geo.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
    this.matChispas = crearMaterialPuntos({ color: '#ffe6a8', tamano: 170, pixelRatio: this.o.pixelRatio });
    this.chispas = new THREE.Points(geo, this.matChispas);
    this.chispas.frustumCulled = false;
    this.grupo.add(this.chispas);
    this.indiceChispa = 0;
    this.indiceExplosion = 0;
  }

  // ---------- API pública ----------

  agregarA(escena) { escena.add(this.grupo); }

  /** Ajusta el volumen donde caen los pétalos según lo que ve la cámara. */
  ajustarLimites(ancho, alto) {
    this.limites.ancho = ancho * 1.15;
    this.limites.alto = alto * 1.1;
  }

  /** Comienza la lluvia de pétalos y las luciérnagas. */
  empezar() {
    this.cayendo = true;
    this.luciernagas.visible = true;
  }

  setPixelRatio(pr) {
    for (const m of [this.matEstrellas, this.matLuciernagas, this.matChispas]) if (m) m.uniforms.uPixelRatio.value = pr;
  }

  /** Pequeña explosión de pétalos y brillitos en un punto 3D. */
  explotar(punto) {
    const nExp = this.o.cantidades.explosion;
    const nCaen = this.o.cantidades.petalos;
    const cuantos = this.o.movimientoReducido ? 5 : 12;
    for (let k = 0; k < cuantos; k++) {
      const d = this.datosPetalos[nCaen + (this.indiceExplosion++ % nExp)];
      d.pos.copy(punto);
      d.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(1.2 + Math.random() * 1.6);
      d.vida = 1;
    }
    const nChispas = this.o.movimientoReducido ? 10 : 26;
    for (let k = 0; k < nChispas; k++) {
      const c = this.datosChispas[this.indiceChispa++ % this.datosChispas.length];
      c.pos.copy(punto);
      c.vel.set(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).normalize().multiplyScalar(0.8 + Math.random() * 2.2);
      c.dur = 0.8 + Math.random() * 0.9;
      c.vida = 1;
    }
  }

  actualizar(dt, t) {
    for (const m of [this.matEstrellas, this.matLuciernagas, this.matChispas]) if (m) m.uniforms.uTiempo.value = t;

    if (this.cayendo) this.intensidad = Math.min(1, this.intensidad + dt * 0.5);
    const L = this.limites;
    const dummy = this.dummy;
    const lento = this.o.movimientoReducido ? 0.5 : 1;

    for (let i = 0; i < this.datosPetalos.length; i++) {
      const d = this.datosPetalos[i];
      let escala;
      if (!d.explosion) {
        // Caída lenta con vaivén ondulante
        d.pos.y += d.vel.y * dt * lento;
        d.pos.x += Math.sin(t * 0.8 + d.fase) * 0.25 * dt * lento;
        d.pos.z += Math.cos(t * 0.6 + d.fase) * 0.12 * dt * lento;
        if (d.pos.y < -L.alto / 2 - 0.5) this.#reciclarPetalo(d);
        escala = this.intensidad * d.escala;
      } else {
        if (d.vida <= 0) { escala = 0; }
        else {
          d.vida -= dt / 1.8;
          d.vel.multiplyScalar(1 - dt * 1.6);
          d.vel.y -= dt * 0.6;
          d.pos.addScaledVector(d.vel, dt);
          escala = Math.max(0, Math.sin(Math.min(1, d.vida) * Math.PI * 0.5)) * d.escala * 1.2;
        }
      }
      d.rot.x += d.giro.x * dt * lento;
      d.rot.y += d.giro.y * dt * lento;
      d.rot.z += d.giro.z * dt * lento;
      dummy.position.copy(d.pos);
      dummy.rotation.copy(d.rot);
      dummy.scale.setScalar(Math.max(escala, 0.0001));
      dummy.updateMatrix();
      this.petalos.setMatrixAt(i, dummy.matrix);
    }
    this.petalos.instanceMatrix.needsUpdate = true;

    // Chispas
    const pos = this.chispas.geometry.attributes.position;
    const vida = this.chispas.geometry.attributes.aVida;
    for (let i = 0; i < this.datosChispas.length; i++) {
      const c = this.datosChispas[i];
      if (c.vida > 0) {
        c.vida -= dt / c.dur;
        c.vel.multiplyScalar(1 - dt * 2.2);
        c.vel.y += dt * 0.25; // los brillitos suben un poquito
        c.pos.addScaledVector(c.vel, dt);
      }
      pos.setXYZ(i, c.pos.x, c.pos.y, c.pos.z);
      vida.setX(i, Math.max(0, c.vida));
    }
    pos.needsUpdate = true;
    vida.needsUpdate = true;
  }
}
