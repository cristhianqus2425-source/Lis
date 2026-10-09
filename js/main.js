// =====================================================================
//  main.js — Escena 3D, cámara, luces, bucle de render y flujo de la
//  experiencia (inicio → transición → florecimiento → mensaje → final).
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CONFIG } from '../config.js';
import { Ramo, easeInOutCubic } from './flowers.js';
import { Particulas } from './particles.js';
import { Ambiente } from './ambiente.js';
import { Interfaz } from './ui.js';

// ---------- entorno y calidad ----------
const parametros = new URLSearchParams(location.search);
const modoCaptura = parametros.has('captura');
const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esMovil = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const gamaBaja = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 2;
const mqTarjetaLateral = matchMedia('(min-aspect-ratio: 6/5) and (min-width: 700px)');

const calidad = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, esMovil && gamaBaja ? 1.5 : 2),
  bloom: !(esMovil && gamaBaja),
};

const cantidades = {
  estrellas: esMovil ? 700 : 1400,
  petalos: movimientoReducido ? 24 : esMovil ? (gamaBaja ? 45 : 70) : 130,
  luciernagas: movimientoReducido ? 14 : esMovil ? 26 : 46,
  explosion: esMovil ? 36 : 60,
  chispas: esMovil ? 90 : 160,
};

// ---------- renderer, escena y cámara ----------
const canvas = document.getElementById('escena');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !calidad.bloom, // con bloom el antialias lo hace el render target (MSAA)
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(calidad.pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const escena = new THREE.Scene();
escena.background = crearFondoDegradado();
escena.fog = new THREE.Fog('#2a0f3d', 10, 40);

const camara = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
const objetivo = new THREE.Vector3(0, -0.1, 0); // centro del ramo
escena.add(camara);

/** Degradado nocturno violeta, dibujado en un canvas y usado como fondo. */
function crearFondoDegradado() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0d0316');
  grad.addColorStop(0.45, '#22092f');
  grad.addColorStop(0.78, '#3a1456');
  grad.addColorStop(1, '#4b1f6c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- luces ----------
// Las luces principales viajan en un "rig" que gira con la cámara, así el
// brillo dorado y el contraluz lila siempre se ven desde donde miramos.
escena.add(new THREE.AmbientLight('#8f6fb8', 0.25));
escena.add(new THREE.HemisphereLight('#dcbcff', '#1a0b29', 0.75));

// Iluminación de entorno (IBL): da reflejos y volumen reales al satén, al papel
// y al terciopelo de los pétalos. Se genera en memoria, sin descargar imágenes.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  escena.environmentIntensity = 0.32;
  pmrem.dispose();
}

const rigLuces = new THREE.Group();
escena.add(rigLuces);
const luzDorada = new THREE.PointLight('#ffd58a', 34, 0, 2);
luzDorada.position.set(2.4, 3.2, 3.4);
rigLuces.add(luzDorada);
const luzContra = new THREE.DirectionalLight('#c084ff', 2.6); // rim light lila
luzContra.position.set(-2.5, 3.5, -6);
rigLuces.add(luzContra, luzContra.target);
const luzRelleno = new THREE.DirectionalLight('#f3d9ff', 0.5);
luzRelleno.position.set(-3, 1, 4);
rigLuces.add(luzRelleno, luzRelleno.target);

// ---------- ramo y partículas ----------
const ramo = new Ramo({ calidad: esMovil && gamaBaja ? 'baja' : 'alta', movimientoReducido });
ramo.agregarA(escena);

const particulas = new Particulas({ cantidades, pixelRatio: calidad.pixelRatio, movimientoReducido });
particulas.agregarA(escena);

const ambiente = new Ambiente({ esMovil, gamaBaja, pixelRatio: calidad.pixelRatio, movimientoReducido });
ambiente.agregarA(escena);

// ---------- postprocesado (bloom suave) ----------
let compositor = null, bloom = null, acabado = null;

const ShaderAcabado = {
  uniforms: {
    tDiffuse: { value: null },
    uTiempo: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrano: { value: esMovil ? 0.035 : 0.045 },
    uAberracion: { value: 0.0022 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTiempo;
    uniform vec2 uRes;
    uniform float uGrano;
    uniform float uAberracion;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d);
      vec2 off = d * uAberracion * r * 2.0;
      vec3 c = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // Sombras hacia el violeta, luces cálidas doradas
      c = mix(c, c * vec3(1.03, 0.94, 1.12), 1.0 - l);
      c = mix(c, c * vec3(1.07, 1.02, 0.93), smoothstep(0.5, 1.0, l));
      c += vec3(0.018, 0.0, 0.03) * (1.0 - l);
      // Viñeta suave
      c *= mix(0.62, 1.0, 1.0 - smoothstep(0.3, 0.85, r));
      // Grano de película
      c += (hash(vUv * uRes + fract(uTiempo * 7.0) * 100.0) - 0.5) * uGrano;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
function crearCompositor() {
  const objetivoRender = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: esMovil ? 0 : 4 });
  compositor = new EffectComposer(renderer, objetivoRender);
  compositor.setPixelRatio(calidad.pixelRatio);
  compositor.addPass(new RenderPass(escena, camara));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.78);
  compositor.addPass(bloom);
  compositor.addPass(new OutputPass());
  // Acabado de cine: gradación de color, viñeta, aberración cromática leve y grano
  acabado = new ShaderPass(ShaderAcabado);
  acabado.uniforms.uRes.value.set(innerWidth * calidad.pixelRatio, innerHeight * calidad.pixelRatio);
  compositor.addPass(acabado);
  document.body.classList.remove('sin-post');
  compositor.setSize(innerWidth, innerHeight);
}
if (calidad.bloom) crearCompositor();
else document.body.classList.add('sin-post');

// ---------- controles ----------
const controles = new OrbitControls(camara, canvas);
controles.target.copy(objetivo);
controles.enableDamping = true;
controles.dampingFactor = 0.06;
controles.enablePan = false;
controles.rotateSpeed = 0.55;
controles.zoomSpeed = 0.6;
controles.minPolarAngle = 1.05;  // no mirar desde muy arriba
controles.maxPolarAngle = 1.72;  // ni desde muy abajo
controles.autoRotateSpeed = 0.55;
controles.enabled = false;

// ---------- encuadre responsivo ----------
const tanMitadFov = () => Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));

/** Distancia de cámara para que el ramo quepa, considerando dónde va la tarjeta. */
function distanciaIdeal() {
  const aspecto = innerWidth / innerHeight;
  const lateral = mqTarjetaLateral.matches;
  const anchoUtil = lateral ? 0.6 : 1;      // la tarjeta ocupa ~40% a la derecha
  const altoUtil = lateral ? 1 : 0.56;      // en vertical, la tarjeta ocupa la parte baja
  const mitadAncho = 1.95, mitadAlto = 1.95;
  const dAncho = mitadAncho / (tanMitadFov() * aspecto * anchoUtil);
  const dAlto = mitadAlto / (tanMitadFov() * (lateral ? 1 : Math.max(altoUtil, 0.8)));
  const dAltoTarjeta = mitadAlto / (tanMitadFov() * altoUtil * 1.05);
  return Math.max(dAncho, dAlto * (lateral ? 1.15 : 1), lateral ? 0 : dAltoTarjeta * 0.92);
}

// Desplazamiento de la vista (setViewOffset) para correr el ramo y dejar
// espacio a la tarjeta sin mover el centro de rotación.
const desplazamiento = { x: 0, y: 0 };
function desplazamientoDestino() {
  if (!estado.tarjeta || modoCaptura) return modoCaptura ? { x: -innerWidth * 0.2, y: 0 } : { x: 0, y: 0 };
  if (mqTarjetaLateral.matches) return { x: innerWidth * 0.19, y: 0 };
  const limite = interfaz.limiteSuperiorTarjeta();
  // Centrar el ramo en el espacio libre sobre la tarjeta
  const centroLibre = Math.max(innerHeight * 0.3, limite / 2);
  return { x: 0, y: innerHeight / 2 - centroLibre };
}

function aplicarDesplazamiento(suave) {
  const d = desplazamientoDestino();
  const k = suave ? 0.04 : 1;
  const nx = desplazamiento.x + (d.x - desplazamiento.x) * k;
  const ny = desplazamiento.y + (d.y - desplazamiento.y) * k;
  if (Math.abs(nx - desplazamiento.x) < 0.05 && Math.abs(ny - desplazamiento.y) < 0.05 && suave) return;
  desplazamiento.x = nx; desplazamiento.y = ny;
  camara.setViewOffset(innerWidth, innerHeight, nx, ny, innerWidth, innerHeight);
}

let distancia = distanciaIdeal();
function alRedimensionar() {
  const w = innerWidth, h = innerHeight;
  camara.aspect = w / h;
  renderer.setSize(w, h, false);
  compositor?.setSize(w, h);
  acabado?.uniforms.uRes.value.set(w * calidad.pixelRatio, h * calidad.pixelRatio);
  const nueva = distanciaIdeal();
  if (estado.escena && !estado.volando) {
    // Mantener la dirección de la cámara, ajustar solo la distancia
    const dir = camara.position.clone().sub(controles.target).normalize();
    camara.position.copy(controles.target).addScaledVector(dir, nueva);
  }
  distancia = nueva;
  controles.minDistance = distancia * 0.72;
  controles.maxDistance = distancia * 1.3;
  escena.fog.near = distancia - 1;
  escena.fog.far = distancia + 26;
  const altoVisible = 2 * distancia * tanMitadFov();
  particulas.ajustarLimites(altoVisible * camara.aspect, altoVisible);
  aplicarDesplazamiento(false);
  camara.updateProjectionMatrix();
}

// ---------- mini sistema de animaciones (avanza con el reloj del render) ----------
const animaciones = new Set();
function animar(duracion, alAvanzar, easing = easeInOutCubic) {
  return new Promise((resolver) => animaciones.add({ t: 0, duracion, alAvanzar, easing, resolver }));
}
const pausa = (s) => animar(s, () => {});

// ---------- estado ----------
const estado = { escena: false, volando: false, tarjeta: false, florecimientoId: 0 };
const interfaz = new Interfaz(CONFIG, { movimientoReducido });

// ---------- parallax (mouse y giroscopio) ----------
const parallax = { x: 0, y: 0, destinoX: 0, destinoY: 0, offset: new THREE.Vector3() };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  parallax.destinoX = (e.clientX / innerWidth) * 2 - 1;
  parallax.destinoY = (e.clientY / innerHeight) * 2 - 1;
});
let betaBase = null;
function alOrientar(e) {
  if (e.beta == null || e.gamma == null) return;
  if (betaBase === null) betaBase = e.beta; // calibrar con la posición en que lo sostiene
  parallax.destinoX = THREE.MathUtils.clamp(e.gamma / 25, -1, 1);
  parallax.destinoY = THREE.MathUtils.clamp((e.beta - betaBase) / 25, -1, 1);
}
/** Pide permiso del giroscopio (iOS). Debe llamarse dentro del toque del usuario. */
function pedirGiroscopio() {
  if (movimientoReducido || !esMovil || !window.DeviceOrientationEvent) return;
  const DOE = window.DeviceOrientationEvent;
  if (typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then((r) => r === 'granted' && addEventListener('deviceorientation', alOrientar)).catch(() => {});
  } else {
    addEventListener('deviceorientation', alOrientar);
  }
}

const vDerecha = new THREE.Vector3(), vArriba = new THREE.Vector3();
function aplicarParallax(dt) {
  // Quitar el desplazamiento del frame anterior para no "ensuciar" a OrbitControls
  camara.position.sub(parallax.offset);
  controles.update(dt);
  const k = 1 - Math.exp(-dt * 3);
  parallax.x += (parallax.destinoX - parallax.x) * k;
  parallax.y += (parallax.destinoY - parallax.y) * k;
  const fuerza = movimientoReducido ? 0 : distancia * 0.05;
  vDerecha.setFromMatrixColumn(camara.matrixWorld, 0);
  vArriba.setFromMatrixColumn(camara.matrixWorld, 1);
  parallax.offset.copy(vDerecha).multiplyScalar(parallax.x * fuerza).addScaledVector(vArriba, -parallax.y * fuerza * 0.6);
  camara.position.add(parallax.offset);
  camara.lookAt(controles.target);
}

// ---------- toque: explosión de pétalos ----------
const rayo = new THREE.Raycaster();
const plano = new THREE.Plane();
const puntoToque = new THREE.Vector3();
let inicioToque = null;
canvas.addEventListener('pointerdown', (e) => { inicioToque = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!inicioToque || !estado.escena) return;
  const movido = Math.hypot(e.clientX - inicioToque.x, e.clientY - inicioToque.y);
  const rapido = performance.now() - inicioToque.t < 400;
  inicioToque = null;
  if (movido > 10 || !rapido) return; // fue un arrastre, no un toque
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  rayo.setFromCamera(ndc, camara);
  const normal = camara.getWorldDirection(new THREE.Vector3());
  plano.setFromNormalAndCoplanarPoint(normal, controles.target);
  if (rayo.ray.intersectPlane(plano, puntoToque)) {
    puntoToque.addScaledVector(normal, -1.6); // un poco delante del ramo
    particulas.explotar(puntoToque);
  }
});
// iOS: evitar zoom con gesto de pellizco sobre la página
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- calidad adaptativa ----------
const medidor = { frames: 0, tiempo: 0, ventanas: 0 };
function medirRendimiento(dt) {
  if (!estado.escena) return;
  medidor.frames++; medidor.tiempo += dt;
  if (medidor.tiempo < 2) return;
  const fps = medidor.frames / medidor.tiempo;
  medidor.frames = 0; medidor.tiempo = 0;
  if (++medidor.ventanas < 2) return; // ignorar el arranque
  if (fps < 45 && compositor) {
    compositor.dispose(); compositor = null; bloom = null; acabado = null; // sin postprocesado
    document.body.classList.add('sin-post'); // viñeta por CSS como respaldo
  } else if (fps < 38 && calidad.pixelRatio > 1.25) {
    calidad.pixelRatio = Math.max(1, calidad.pixelRatio - 0.5);
    renderer.setPixelRatio(calidad.pixelRatio);
    particulas.setPixelRatio(calidad.pixelRatio);
    ambiente.setPixelRatio(calidad.pixelRatio);
    alRedimensionar();
  }
}

// ---------- bucle principal ----------
const reloj = new THREE.Clock();
let tiempo = 0;
const centroRig = new THREE.Vector3();

function cuadro() {
  paso(Math.min(reloj.getDelta(), 1 / 20));
}

function paso(dt, dibujar = true) {
  tiempo += dt;

  for (const a of animaciones) {
    a.t += dt;
    const k = Math.min(1, a.t / a.duracion);
    a.alAvanzar(a.easing(k));
    if (k >= 1) { animaciones.delete(a); a.resolver(); }
  }

  ramo.actualizar(dt, tiempo);
  particulas.actualizar(dt, tiempo);
  ambiente.actualizar(dt, tiempo, camara, controles.target, ramo.progreso);
  if (acabado) acabado.uniforms.uTiempo.value = tiempo;

  if (estado.escena && !estado.volando) aplicarParallax(dt);
  else if (!estado.escena && !estado.volando) {
    // En la pantalla de inicio la cámara flota suavemente
    camara.position.y = posicionInicial.y + Math.sin(tiempo * 0.4) * 0.3;
    camara.lookAt(objetivo);
  }
  aplicarDesplazamiento(true);

  // El rig de luces sigue el ángulo de la cámara alrededor del ramo
  centroRig.copy(camara.position).sub(controles.target);
  rigLuces.rotation.y = Math.atan2(centroRig.x, centroRig.z);

  if (!dibujar) return;
  if (compositor) compositor.render(dt);
  else renderer.render(escena, camara);

  medirRendimiento(dt);
}

// Pausar el render cuando la pestaña no está visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) renderer.setAnimationLoop(null);
  else { reloj.getDelta(); renderer.setAnimationLoop(cuadro); }
});

// ---------- flujo de la experiencia ----------
const posicionInicial = new THREE.Vector3();
function posicionFinal() {
  const polar = 1.38; // un poco por encima del horizonte
  return new THREE.Vector3(0, Math.cos(polar), Math.sin(polar)).multiplyScalar(distancia).add(objetivo);
}

/** 2. La cámara viaja desde lejos hasta el ramo. */
async function volarHaciaElRamo() {
  estado.volando = true;
  // Entrada cinematográfica: la cámara baja desde el cielo girando alrededor del ramo
  const desde = new THREE.Spherical().setFromVector3(camara.position.clone().sub(objetivo));
  const hasta = new THREE.Spherical().setFromVector3(posicionFinal().sub(objetivo));
  const esf = new THREE.Spherical();
  await animar(movimientoReducido ? 1.2 : 4.2, (k) => {
    esf.radius = THREE.MathUtils.lerp(desde.radius, hasta.radius, k);
    esf.phi = THREE.MathUtils.lerp(desde.phi, hasta.phi, Math.pow(k, 0.7));
    esf.theta = THREE.MathUtils.lerp(desde.theta, hasta.theta, k);
    camara.position.setFromSpherical(esf).add(objetivo);
    camara.lookAt(objetivo);
  });
  estado.volando = false;
  estado.escena = true;
  controles.enabled = true;
  controles.autoRotate = !movimientoReducido;
  controles.update();
}

/** 3–6. Florecimiento, mensaje, recuerdos y firma. */
async function secuenciaFlorecimiento() {
  const id = ++estado.florecimientoId;
  ramo.florecer();
  await ramo.esperarHasta(ramo.duracion * 0.72);
  if (id !== estado.florecimientoId) return;
  estado.tarjeta = true;
  await interfaz.mostrarTarjeta();
  if (id !== estado.florecimientoId) return;
  interfaz.mostrarRecuerdos(posicionesRecuerdos);
}

/** Puntos de pantalla a los lados del ramo para los recuerdos. */
function posicionesRecuerdos() {
  // Centro del ramo en pantalla y cuántos píxeles mide una unidad 3D a esa distancia
  camara.updateMatrixWorld();
  const centro = controles.target.clone().project(camara);
  const cx = (centro.x * 0.5 + 0.5) * innerWidth;
  const cy = (-centro.y * 0.5 + 0.5) * innerHeight;
  const escala = innerHeight / (2 * camara.position.distanceTo(controles.target) * tanMitadFov());
  // Anclas (en unidades del ramo) a los costados y por encima de las flores
  const anclas = [[-1.9, 1.2], [1.9, 0.7], [-2.0, -0.4], [1.8, 1.8], [0, 2.3], [2.0, -0.6]];
  const limiteY = interfaz.limiteSuperiorTarjeta();
  return anclas.map(([x, y]) => ({ x: cx + x * escala, y: cy - y * escala, limiteY }));
}

interfaz.alPedirOtraVez(() => {
  interfaz.ocultarTarjeta();
  interfaz.detenerRecuerdos();
  estado.tarjeta = false;
  secuenciaFlorecimiento();
});

async function iniciar() {
  alRedimensionar();
  // Posición de la intro: alta y de costado; desde ahí la cámara baja girando
  const giro = movimientoReducido ? 0 : 1.9;
  posicionInicial.copy(objetivo).add(new THREE.Vector3(Math.sin(giro) * distancia * 2.3, distancia * 0.55, Math.cos(giro) * distancia * 2.3));
  camara.position.copy(posicionInicial);
  camara.lookAt(objetivo);
  addEventListener('resize', alRedimensionar);
  mqTarjetaLateral.addEventListener?.('change', alRedimensionar);

  // Compilar shaders antes de mostrar nada (evita tirones al empezar)
  try { await renderer.compileAsync(escena, camara); } catch { /* navegadores sin compileAsync */ }
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]);
  renderer.setAnimationLoop(cuadro);

  if (modoCaptura) return iniciarCaptura();

  await new Promise((r) => setTimeout(r, 300));
  interfaz.ocultarCarga();
  interfaz.mostrarIntro();

  // 1. Esperar el toque (también habilita audio y giroscopio).
  //    Con ?auto en la URL arranca solo (útil para probar).
  if (!parametros.has('auto')) {
    await interfaz.esperarToque(() => {
      interfaz.iniciarMusica();
      pedirGiroscopio();
    });
  }

  // 2. Transición
  interfaz.abrirCapullo();
  particulas.empezar();
  const vuelo = volarHaciaElRamo();
  await pausa(movimientoReducido ? 0.6 : 2.2);
  // 3. El ramo empieza a crecer mientras la cámara termina de llegar
  secuenciaFlorecimiento();
  await vuelo;
}

/** Modo especial (?captura) para generar la imagen preview.png. */
function iniciarCaptura() {
  document.body.classList.add('captura');
  estado.escena = true;
  camara.position.copy(posicionFinal()).sub(objetivo).multiplyScalar(1.18).add(objetivo);
  controles.update();
  particulas.empezar();
  particulas.intensidad = 1;
  ramo.florecer();
  ramo.tiempo = 30;
  window.__capturaLista = true;
}

iniciar().catch((err) => {
  console.error(err);
  const p = document.querySelector('#carga p');
  if (p) p.textContent = 'Ups, tu navegador no pudo cargar las flores 🥲 Intenta abrir el link en Chrome o Safari.';
});

// Depuración: con ?debug en la URL se puede avanzar la animación a mano
// desde la consola, por ejemplo: __avanzar(5)
if (parametros.has('debug')) {
  window.__escena = escena;
  window.__desactivarPost = () => { compositor = null; };
  window.__avanzar = (segundos, dt = 1 / 60) => {
    for (let s = 0; s < segundos; s += dt) paso(dt, s + dt >= segundos);
    return { estado, ramo: ramo.tiempo, bloom: !!compositor };
  };
}
