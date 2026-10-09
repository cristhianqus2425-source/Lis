// =====================================================================
//  main.js — Orquesta las capas y el flujo de la experiencia.
//
//  Capas (de atrás hacia adelante):
//    1. #fondo   canvas 2D: estrellas + bokeh            (fondo.js)
//    2. #flor    video real de la flor abriéndose          (flor.js)
//    3. #escena  Three.js transparente: pétalos que caen,
//                luciérnagas y explosión al tocar           (particles.js)
//    4. rayos de luz, viñeta y grano (CSS)
//  Cada capa se mueve distinto con el giroscopio/mouse → sensación 3D.
//
//  Flujo: carga → "toca para abrir" → destello → la flor se abre →
//         tarjeta con el mensaje → recuerdos → firma y "ver de nuevo".
// =====================================================================
import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Particulas } from './particles.js';
import { Fondo } from './fondo.js';
import { Flor } from './flor.js';
import { Interfaz } from './ui.js';

// ---------- entorno y calidad ----------
const parametros = new URLSearchParams(location.search);
const modoCaptura = parametros.has('captura');
const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esMovil = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const gamaBaja = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 2;

const calidad = { pixelRatio: Math.min(window.devicePixelRatio || 1, esMovil && gamaBaja ? 1.5 : 2) };
const cantidades = {
  estrellas: 0, // las estrellas van en el fondo 2D, detrás de la flor
  petalos: movimientoReducido ? 18 : esMovil ? (gamaBaja ? 32 : 50) : 90,
  luciernagas: movimientoReducido ? 10 : esMovil ? 20 : 34,
  explosion: esMovil ? 36 : 60,
  chispas: esMovil ? 90 : 160,
};

if (modoCaptura) document.body.classList.add('captura');

// ---------- capas ----------
const fondo = new Fondo(document.getElementById('fondo'), { esMovil, movimientoReducido });
const flor = new Flor(document.getElementById('flor'), { movimientoReducido, captura: modoCaptura });
const interfaz = new Interfaz(CONFIG, { movimientoReducido });

// Capa delantera Three.js con fondo transparente
const canvas = document.getElementById('escena');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !esMovil, powerPreference: 'high-performance' });
renderer.setPixelRatio(calidad.pixelRatio);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camara.position.set(0, 0, 8);

escena.add(new THREE.AmbientLight('#b89ad9', 0.7));
const luzDorada = new THREE.PointLight('#ffd58a', 40, 0, 2);
luzDorada.position.set(2, 3, 5);
escena.add(luzDorada);
const luzLila = new THREE.DirectionalLight('#c084ff', 1.6);
luzLila.position.set(-3, 2, -4);
escena.add(luzLila);

const particulas = new Particulas({ cantidades, pixelRatio: calidad.pixelRatio, movimientoReducido });
particulas.agregarA(escena);

// ---------- tamaño ----------
const tanMitadFov = () => Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
function alRedimensionar() {
  const w = innerWidth, h = innerHeight;
  camara.aspect = w / h;
  camara.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  fondo.ajustar();
  const alto = 2 * camara.position.z * tanMitadFov();
  particulas.ajustarLimites(alto * camara.aspect, alto);
}

// ---------- parallax (mouse y giroscopio) ----------
const parallax = { x: 0, y: 0, destinoX: 0, destinoY: 0 };
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  parallax.destinoX = (e.clientX / innerWidth) * 2 - 1;
  parallax.destinoY = (e.clientY / innerHeight) * 2 - 1;
});
let betaBase = null;
function alOrientar(e) {
  if (e.beta == null || e.gamma == null) return;
  if (betaBase === null) betaBase = e.beta; // la posición en que lo sostiene es el "centro"
  parallax.destinoX = THREE.MathUtils.clamp(e.gamma / 20, -1, 1);
  parallax.destinoY = THREE.MathUtils.clamp((e.beta - betaBase) / 20, -1, 1);
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

// ---------- toque: explosión de pétalos ----------
const estado = { escena: false, tarjeta: false, florecimientoId: 0 };
const rayo = new THREE.Raycaster();
const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5);
const punto = new THREE.Vector3();
let inicioToque = null;
addEventListener('pointerdown', (e) => { inicioToque = { x: e.clientX, y: e.clientY, t: performance.now() }; });
addEventListener('pointerup', (e) => {
  if (!inicioToque || !estado.escena) return;
  if (e.target.closest('#tarjeta, button')) { inicioToque = null; return; }
  const movido = Math.hypot(e.clientX - inicioToque.x, e.clientY - inicioToque.y);
  const rapido = performance.now() - inicioToque.t < 450;
  inicioToque = null;
  if (movido > 12 || !rapido) return;
  rayo.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camara);
  if (rayo.ray.intersectPlane(plano, punto)) particulas.explotar(punto);
});
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- calidad adaptativa: si va lento, menos resolución ----------
const medidor = { frames: 0, tiempo: 0, ventanas: 0 };
function medirRendimiento(dt) {
  if (!estado.escena) return;
  medidor.frames++; medidor.tiempo += dt;
  if (medidor.tiempo < 2) return;
  const fps = medidor.frames / medidor.tiempo;
  medidor.frames = 0; medidor.tiempo = 0;
  if (++medidor.ventanas < 2) return;
  if (fps < 40 && calidad.pixelRatio > 1) {
    calidad.pixelRatio = Math.max(1, calidad.pixelRatio - 0.5);
    renderer.setPixelRatio(calidad.pixelRatio);
    particulas.setPixelRatio(calidad.pixelRatio);
    alRedimensionar();
  }
}

// ---------- bucle principal ----------
const reloj = new THREE.Clock();
let tiempo = 0;
function cuadro() {
  const dt = Math.min(reloj.getDelta(), 1 / 20);
  tiempo += dt;

  const k = 1 - Math.exp(-dt * 3);
  parallax.x += (parallax.destinoX - parallax.x) * k;
  parallax.y += (parallax.destinoY - parallax.y) * k;

  // Las luces del fondo se encienden a medida que se abre la flor
  fondo.destinoIntensidad = estado.escena ? 0.35 + flor.progreso * 0.65 : 0.35;
  fondo.dibujar(dt, tiempo, parallax);
  flor.actualizar(parallax);

  // La capa delantera se mueve más que las otras (está "más cerca")
  const fuerza = movimientoReducido ? 0 : 0.5;
  camara.position.x = parallax.x * fuerza;
  camara.position.y = -parallax.y * fuerza * 0.7;
  camara.lookAt(0, 0, 0);
  particulas.actualizar(dt, tiempo);
  renderer.render(escena, camara);

  medirRendimiento(dt);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { renderer.setAnimationLoop(null); flor.pausar(); }
  else { reloj.getDelta(); renderer.setAnimationLoop(cuadro); flor.reanudar(); }
});

// ---------- flujo de la experiencia ----------

/** La flor se abre; cuando va bastante avanzada aparece la tarjeta. */
async function secuenciaFlorecimiento() {
  const id = ++estado.florecimientoId;
  flor.florecer();
  await flor.esperarHasta(flor.duracion * 0.62);
  if (id !== estado.florecimientoId) return;
  estado.tarjeta = true;
  document.body.classList.add('con-tarjeta');
  await interfaz.mostrarTarjeta();
  if (id !== estado.florecimientoId) return;
  interfaz.mostrarRecuerdos(posicionesRecuerdos);
}

/** Puntos a los costados de la flor para los recuerdos flotantes. */
function posicionesRecuerdos() {
  const r = flor.rect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
  const dx = Math.min(r.width * 0.3, 260), dy = r.height * 0.22;
  const limiteY = interfaz.limiteSuperiorTarjeta();
  return [[-1, -0.6], [1, -0.2], [-1, 0.5], [1, 0.7], [0, -1.1], [-0.8, 1]]
    .map(([x, y]) => ({ x: cx + x * dx, y: cy + y * dy, limiteY }));
}

interfaz.alPedirOtraVez(() => {
  interfaz.ocultarTarjeta();
  interfaz.detenerRecuerdos();
  estado.tarjeta = false;
  document.body.classList.remove('con-tarjeta');
  secuenciaFlorecimiento();
});

async function iniciar() {
  alRedimensionar();
  addEventListener('resize', alRedimensionar);
  renderer.setAnimationLoop(cuadro);

  if (modoCaptura) {
    estado.escena = true;
    particulas.empezar();
    particulas.intensidad = 1;
    fondo.destinoIntensidad = fondo.intensidad = 1;
    return;
  }

  await Promise.all([
    flor.listo(),
    Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]),
  ]);
  interfaz.ocultarCarga();
  interfaz.mostrarIntro();

  // 1. Esperar el toque (habilita música y giroscopio). Con ?auto arranca solo.
  if (!parametros.has('auto')) {
    await interfaz.esperarToque(() => {
      flor.desbloquear();
      interfaz.iniciarMusica();
      pedirGiroscopio();
    });
  }

  // 2. Destello y la flor empieza a abrirse
  estado.escena = true;
  interfaz.abrirCapullo();
  particulas.empezar();
  await new Promise((r) => setTimeout(r, movimientoReducido ? 300 : 900));
  secuenciaFlorecimiento();
}

iniciar().catch((err) => {
  console.error(err);
  const p = document.querySelector('#carga p');
  if (p) p.textContent = 'Ups, tu navegador no pudo cargar la rosa 🥲 Intenta abrir el link en Chrome o Safari.';
});
