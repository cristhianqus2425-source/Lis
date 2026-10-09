// =====================================================================
//  flor.js — Capa central: el video real de la flor abriéndose.
//
//  Una rosa real abriéndose (time-lapse), teñida de morado.
//  El video tiene fondo negro y se dibuja con mix-blend-mode: lighten,
//  así el negro "desaparece" y la flor flota sobre el cielo violeta.
//  Hay dos versiones: vertical (celular) y horizontal (laptop).
// =====================================================================

const VIDEOS = {
  vertical: {
    video: './assets/video/rosa-vertical.mp4',
    inicio: './assets/video/rosa-vertical-inicio.jpg',
    final: './assets/video/rosa-vertical-final.jpg',
  },
  horizontal: {
    video: './assets/video/rosa-horizontal.mp4',
    inicio: './assets/video/rosa-horizontal-inicio.jpg',
    final: './assets/video/rosa-horizontal-final.jpg',
  },
};

// El time-lapse dura ~12 s; lo reproducimos un poco más lento para disfrutarlo
const VELOCIDAD = 0.75;

export class Flor {
  /**
   * @param {HTMLElement} contenedor  #flor
   * @param {object} o { movimientoReducido, captura }
   */
  constructor(contenedor, o) {
    this.contenedor = contenedor;
    this.video = contenedor.querySelector('video');
    this.o = o;
    this.esperas = []; // { segundos, resolver }
    this.fallo = false;

    // Elegir la versión según la forma de la pantalla (una sola descarga)
    this.version = innerWidth / innerHeight < 1.05 ? VIDEOS.vertical : VIDEOS.horizontal;
    const v = this.video;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.defaultPlaybackRate = VELOCIDAD;

    if (o.captura) {
      // Para la imagen de vista previa: la flor ya abierta, sin video
      v.poster = this.version.final;
      this.contenedor.classList.add('visible', 'abierta');
      return;
    }

    v.poster = this.version.inicio;
    v.src = this.version.video;
    v.addEventListener('timeupdate', () => this.#revisarEsperas());
    v.addEventListener('ended', () => {
      this.contenedor.classList.add('abierta'); // respiración suave al terminar
      this.#revisarEsperas(true);
    });
    v.addEventListener('error', () => {
      // Si el video no carga, mostramos la foto de la flor abierta
      this.fallo = true;
      v.removeAttribute('src');
      v.poster = this.version.final;
      v.load();
      this.contenedor.classList.add('abierta');
      this.#revisarEsperas(true);
    });
  }

  /** Espera a que haya suficiente video para empezar (máximo `ms`). */
  listo(ms = 9000) {
    if (this.o.captura) return Promise.resolve();
    return new Promise((resolver) => {
      const v = this.video;
      if (v.readyState >= 3) return resolver();
      const fin = () => { clearTimeout(t); resolver(); };
      const t = setTimeout(fin, ms);
      v.addEventListener('canplay', fin, { once: true });
      v.addEventListener('error', fin, { once: true });
    });
  }

  /** Duración del video en segundos (aprox. 12,2 s de video). */
  get duracion() {
    return this.video.duration || 12.2;
  }

  /** 0…1: cuánto se ha abierto la flor. */
  get progreso() {
    if (this.fallo || this.o.captura) return 1;
    return Math.min(1, this.video.currentTime / this.duracion);
  }

  /**
   * Llamar DENTRO del toque del usuario: "desbloquea" la reproducción en iOS
   * (por ejemplo con el modo de ahorro de batería activado).
   */
  desbloquear() {
    if (this.fallo || this.o.captura) return;
    const v = this.video;
    const p = v.play();
    if (p) p.then(() => { if (!this.reproduciendo) v.pause(); }).catch(() => {});
  }

  /** Empieza (o reinicia) el florecimiento. */
  florecer() {
    const v = this.video;
    this.contenedor.classList.remove('abierta');
    this.contenedor.classList.add('visible');
    this.esperas = [];
    if (this.fallo) return;
    this.reproduciendo = true;
    try { v.currentTime = 0; } catch { /* aún sin metadatos */ }
    v.playbackRate = VELOCIDAD;
    v.play().catch(() => {
      // Si el navegador no deja reproducir, mostramos la flor abierta
      v.poster = this.version.final;
      this.fallo = true;
      this.contenedor.classList.add('abierta');
      this.#revisarEsperas(true);
    });
  }

  /** Promesa que se cumple cuando el video llega a `segundos`. */
  esperarHasta(segundos) {
    return new Promise((resolver) => {
      this.esperas.push({ segundos, resolver });
      this.#revisarEsperas();
    });
  }

  #revisarEsperas(forzar = false) {
    const t = this.video.currentTime;
    this.esperas = this.esperas.filter((e) => {
      if (forzar || this.fallo || t >= e.segundos) { e.resolver(); return false; }
      return true;
    });
  }

  /** Pausar/reanudar cuando la pestaña se oculta. */
  pausar() { if (!this.video.paused) { this.video.pause(); this.pausadoPorPestana = true; } }
  reanudar() { if (this.pausadoPorPestana) { this.pausadoPorPestana = false; this.video.play().catch(() => {}); } }

  /**
   * Parallax y resplandor. Se llama en cada cuadro.
   * @param {{x:number,y:number}} parallax  valores entre -1 y 1
   */
  actualizar(parallax) {
    const s = this.contenedor.style;
    const k = this.o.movimientoReducido ? 0 : 1;
    s.setProperty('--px', (parallax.x * k).toFixed(3));
    s.setProperty('--py', (parallax.y * k).toFixed(3));
    s.setProperty('--brillo', (0.25 + this.progreso * 0.75).toFixed(3));
  }

  /** Rectángulo de la flor en pantalla (para ubicar los recuerdos). */
  rect() {
    return this.contenedor.getBoundingClientRect();
  }
}
