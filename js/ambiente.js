// =====================================================================
//  ambiente.js — Atmósfera cinematográfica alrededor del ramo
//   · halo de luz detrás del ramo
//   · rayos de luz que bajan desde arriba
//   · bokeh: luces desenfocadas en el fondo (como una foto con lente abierto)
//   · niebla baja que se mueve lentamente
//  Todo son pocos planos/puntos con shaders simples: barato incluso en celular.
// =====================================================================
import * as THREE from 'three';

const VERTEX_UV = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Ruido suave (value noise + fbm) para la niebla
const RUIDO = /* glsl */ `
  float hashA(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hashA(i), hashA(i + vec2(1, 0)), u.x), mix(hashA(i + vec2(0, 1)), hashA(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int k = 0; k < 4; k++) { v += a * ruido(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

export class Ambiente {
  /**
   * @param {object} o  { esMovil, gamaBaja, pixelRatio, movimientoReducido }
   */
  constructor(o) {
    this.o = o;
    this.grupo = new THREE.Group();
    this.intensidad = 0; // 0 en la intro → 1 con el ramo abierto
    this.tiempo = { value: 0 };
    this.#crearHalo();
    this.#crearRayos();
    this.#crearBokeh();
    if (!o.gamaBaja) this.#crearNiebla();
  }

  // ---------- halo detrás del ramo ----------
  #crearHalo() {
    this.matHalo = new THREE.ShaderMaterial({
      uniforms: { uTiempo: this.tiempo, uIntensidad: { value: 0 } },
      vertexShader: VERTEX_UV,
      fragmentShader: /* glsl */ `
        uniform float uTiempo;
        uniform float uIntensidad;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float pulso = 0.9 + 0.1 * sin(uTiempo * 0.8);
          float nucleo = exp(-d * d * 5.0) * 0.32;
          float aura = exp(-d * d * 1.8) * 0.16;
          vec3 color = mix(vec3(0.55, 0.3, 0.85), vec3(1.0, 0.85, 0.65), nucleo);
          float a = (nucleo + aura) * pulso * uIntensidad * (1.0 - smoothstep(0.7, 1.0, d));
          gl_FragColor = vec4(color * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), this.matHalo);
    this.halo.renderOrder = -1;
    this.grupo.add(this.halo);
  }

  // ---------- rayos de luz ----------
  #crearRayos() {
    this.matRayo = new THREE.ShaderMaterial({
      uniforms: { uTiempo: this.tiempo, uIntensidad: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aFase;
        varying vec2 vUv;
        varying float vFase;
        void main() {
          vUv = uv; vFase = aFase;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTiempo;
        uniform float uIntensidad;
        varying vec2 vUv;
        varying float vFase;
        void main() {
          float ancho = 1.0 - abs(vUv.x - 0.5) * 2.0;
          ancho = pow(clamp(ancho, 0.0, 1.0), 2.5);
          float largo = smoothstep(0.0, 0.55, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
          float parpadeo = 0.6 + 0.4 * sin(uTiempo * 0.5 + vFase * 6.28);
          float a = ancho * largo * parpadeo * 0.065 * uIntensidad;
          gl_FragColor = vec4(mix(vec3(0.75, 0.55, 1.0), vec3(1.0, 0.88, 0.7), vUv.y) * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // Varios planos largos en abanico, que nacen arriba del ramo
    const n = this.o.esMovil ? 5 : 7;
    const geos = [];
    for (let i = 0; i < n; i++) {
      const ancho = 0.5 + Math.random() * 0.9;
      const g = new THREE.PlaneGeometry(ancho, 16, 1, 1);
      g.translate(0, -8, 0); // el origen del rayo queda arriba
      g.rotateZ((i / (n - 1) - 0.5) * 0.9 + (Math.random() - 0.5) * 0.1);
      g.setAttribute('aFase', new THREE.Float32BufferAttribute(new Array(4).fill(Math.random()), 1));
      geos.push(g);
    }
    // Una sola malla con todos los rayos
    this.rayos = new THREE.Mesh(fusionar(geos), this.matRayo);
    this.rayos.renderOrder = -1;
    this.grupo.add(this.rayos);
  }

  // ---------- bokeh: luces desenfocadas del fondo ----------
  #crearBokeh() {
    const n = this.o.esMovil ? 40 : 70;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tam = new Float32Array(n), fase = new Float32Array(n);
    const paleta = ['#b57edc', '#e6ccff', '#f5d58a', '#e7b8e6', '#7b3fb5', '#ffd9f0'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      // En un anillo lejano alrededor del ramo: siempre hay luces detrás, gire donde gire la cámara
      const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 14;
      pos.set([Math.cos(a) * r, -3 + Math.random() * 10, Math.sin(a) * r], i * 3);
      const c = paleta[i % paleta.length];
      col.set([c.r, c.g, c.b], i * 3);
      tam[i] = 0.6 + Math.random() * 1.4;
      fase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aTam', new THREE.BufferAttribute(tam, 1));
    geo.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
    this.matBokeh = new THREE.ShaderMaterial({
      uniforms: {
        uTiempo: this.tiempo,
        uIntensidad: { value: 0.35 },
        uEscala: { value: 2600 * this.o.pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aTam;
        attribute float aFase;
        uniform float uTiempo;
        uniform float uEscala;
        varying vec3 vColor;
        varying float vBrillo;
        void main() {
          vec3 p = position;
          p.y += sin(uTiempo * 0.15 + aFase * 6.28) * 0.6;
          p.x += cos(uTiempo * 0.1 + aFase * 9.0) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uEscala * aTam / -mv.z;
          vColor = aColor;
          vBrillo = 0.65 + 0.35 * sin(uTiempo * 0.6 + aFase * 30.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uIntensidad;
        varying vec3 vColor;
        varying float vBrillo;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // Disco de lente: relleno suave con un borde un poco más brillante
          float disco = 1.0 - smoothstep(0.86, 1.0, d);
          float borde = smoothstep(0.7, 0.95, d) * disco;
          float a = (disco * 0.6 + borde * 0.22) * vBrillo * uIntensidad;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.bokeh = new THREE.Points(geo, this.matBokeh);
    this.bokeh.frustumCulled = false;
    this.bokeh.renderOrder = -2;
    this.grupo.add(this.bokeh);
  }

  // ---------- niebla baja ----------
  #crearNiebla() {
    this.matNiebla = new THREE.ShaderMaterial({
      uniforms: { uTiempo: this.tiempo, uIntensidad: { value: 0 } },
      vertexShader: VERTEX_UV,
      fragmentShader: /* glsl */ `
        uniform float uTiempo;
        uniform float uIntensidad;
        varying vec2 vUv;
        ${RUIDO}
        void main() {
          vec2 p = vUv * vec2(6.0, 1.6);
          float n = fbm(p + vec2(uTiempo * 0.04, 0.0)) * fbm(p * 1.7 - vec2(uTiempo * 0.025, 0.0) + 3.0);
          float bordes = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
          float alto = (1.0 - smoothstep(0.25, 1.0, vUv.y)) * smoothstep(0.0, 0.2, vUv.y);
          float a = n * bordes * alto * 0.38 * uIntensidad;
          gl_FragColor = vec4(vec3(0.62, 0.45, 0.85) * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.niebla = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.5), this.matNiebla);
    this.grupo.add(this.niebla);
  }

  agregarA(escena) { escena.add(this.grupo); }

  setPixelRatio(pr) { this.matBokeh.uniforms.uEscala.value = 2600 * pr; }

  /**
   * @param {number} dt
   * @param {number} t        tiempo global
   * @param {THREE.Camera} camara
   * @param {THREE.Vector3} centro  centro del ramo
   * @param {number} progreso  0…1 avance del florecimiento
   */
  actualizar(dt, t, camara, centro, progreso) {
    this.tiempo.value = t;
    const destino = 0.25 + progreso * 0.75;
    this.intensidad += (destino - this.intensidad) * Math.min(1, dt * 1.5);
    const k = this.intensidad;

    // Dirección desde la cámara hacia el ramo (en el plano horizontal)
    const dir = new THREE.Vector3().subVectors(centro, camara.position);
    dir.y = 0;
    dir.normalize();

    // Halo y rayos: detrás del ramo, mirando a la cámara
    this.halo.position.copy(centro).addScaledVector(dir, 2.2).add(new THREE.Vector3(0, 0.7, 0));
    this.halo.quaternion.copy(camara.quaternion);
    this.matHalo.uniforms.uIntensidad.value = k;

    this.rayos.position.copy(centro).addScaledVector(dir, 2.6).add(new THREE.Vector3(0, 6.5, 0));
    this.rayos.quaternion.copy(camara.quaternion);
    this.rayos.rotation.z += Math.sin(t * 0.1) * 0.05;
    this.matRayo.uniforms.uIntensidad.value = this.o.movimientoReducido ? k * 0.6 : k;

    this.matBokeh.uniforms.uIntensidad.value = 0.12 + k * 0.14;

    if (this.niebla) {
      this.niebla.position.copy(centro).addScaledVector(dir, 1.2).add(new THREE.Vector3(0, -2.3, 0));
      this.niebla.quaternion.copy(camara.quaternion);
      this.matNiebla.uniforms.uIntensidad.value = k;
    }
  }
}

/** Une varias geometrías simples (posición, uv y aFase) en una sola. */
function fusionar(geos) {
  const pos = [], uv = [], fase = [], idx = [];
  let base = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    fase.push(...g.attributes.aFase.array);
    idx.push(...Array.from(g.index.array, (i) => i + base));
    base += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFase', new THREE.Float32BufferAttribute(fase, 1));
  geo.setIndex(idx);
  return geo;
}
