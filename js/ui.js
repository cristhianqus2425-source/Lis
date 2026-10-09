// =====================================================================
//  ui.js — Pantallas, textos, transiciones y música
// =====================================================================

const $ = (sel) => document.querySelector(sel);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class Interfaz {
  constructor(config, { movimientoReducido = false } = {}) {
    this.config = config;
    this.movimientoReducido = movimientoReducido;
    this.el = {
      carga: $('#carga'),
      intro: $('#intro'),
      introNombre: $('#intro-nombre'),
      destello: $('#destello'),
      tarjeta: $('#tarjeta'),
      titulo: $('#titulo'),
      mensaje: $('#mensaje'),
      firma: $('#firma'),
      otraVez: $('#otra-vez'),
      recuerdos: $('#recuerdos'),
      musica: $('#musica'),
    };
    this.audio = null;
    this.escribiendo = null; // { saltar } mientras corre la máquina de escribir
    this.cicloRecuerdos = 0;  // se incrementa para cancelar el ciclo anterior

    // Textos personalizados
    document.title = `${config.para} 💜`;
    this.el.introNombre.textContent = config.para;
    this.el.titulo.textContent = config.titulo;
    this.el.firma.textContent = `— ${config.firma}`;
    this.el.tarjeta.setAttribute('aria-label', `Mensaje para ${config.nombre}`);

    // Tocar la tarjeta mientras se escribe muestra el texto completo
    this.el.tarjeta.addEventListener('click', (e) => {
      if (e.target === this.el.otraVez) return;
      this.escribiendo?.saltar();
    });
  }

  ocultarCarga() {
    this.el.carga.classList.add('oculta');
    setTimeout(() => this.el.carga.remove(), 1200);
  }

  mostrarIntro() {
    this.el.intro.classList.remove('oculta');
  }

  /**
   * Espera el primer toque/clic/tecla en la pantalla de inicio.
   * `alTocar` se ejecuta DENTRO del gesto (necesario para audio y giroscopio en iOS).
   */
  esperarToque(alTocar = () => {}) {
    return new Promise((resolver) => {
      const intro = this.el.intro;
      intro.focus({ preventScroll: true });
      const listo = (e) => {
        if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
        intro.removeEventListener('click', listo);
        window.removeEventListener('keydown', listo);
        alTocar();
        resolver();
      };
      intro.addEventListener('click', listo);
      window.addEventListener('keydown', listo);
    });
  }

  /** El capullo se abre con un destello y la pantalla de inicio se desvanece. */
  async abrirCapullo() {
    this.el.intro.classList.add('abriendo');
    await esperar(this.movimientoReducido ? 200 : 650);
    this.el.destello.classList.add('activo');
    await esperar(350);
    this.el.intro.classList.add('oculta');
    setTimeout(() => this.el.destello.classList.remove('activo'), 500);
    setTimeout(() => this.el.intro.remove(), 1500);
  }

  // ---------- música ----------

  /** Debe llamarse dentro del gesto del usuario (políticas de autoplay). */
  iniciarMusica() {
    const archivo = (this.config.musica || '').trim();
    if (!archivo) return;
    const audio = new Audio(`./assets/audio/${encodeURIComponent(archivo)}`);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    this.audio = audio;
    const btn = this.el.musica;

    audio.addEventListener('error', () => { btn.hidden = true; this.audio = null; });
    audio.play().then(() => {
      btn.hidden = false;
      btn.classList.add('visible');
      this.#fundirVolumen(this.config.volumen ?? 0.6, 2500);
    }).catch(() => { btn.hidden = false; btn.classList.add('visible', 'silenciado'); });

    btn.addEventListener('click', () => {
      if (!this.audio) return;
      if (this.audio.paused || this.audio.muted) {
        this.audio.muted = false;
        this.audio.play().catch(() => {});
        if (this.audio.volume === 0) this.#fundirVolumen(this.config.volumen ?? 0.6, 1200);
        btn.classList.remove('silenciado');
        btn.setAttribute('aria-label', 'Silenciar música');
      } else {
        this.audio.muted = true;
        btn.classList.add('silenciado');
        btn.setAttribute('aria-label', 'Activar música');
      }
    });

    // Pausar la música si se cambia de pestaña
    document.addEventListener('visibilitychange', () => {
      if (!this.audio || this.audio.muted) return;
      if (document.hidden) this.audio.pause();
      else this.audio.play().catch(() => {});
    });
  }

  #fundirVolumen(destino, ms) {
    const a = this.audio;
    const inicio = performance.now(), desde = a.volume;
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / ms);
      a.volume = desde + (destino - desde) * t;
      if (t < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  // ---------- tarjeta del mensaje ----------

  async mostrarTarjeta() {
    const { tarjeta, mensaje, firma, otraVez } = this.el;
    mensaje.textContent = '';
    firma.classList.remove('visible');
    otraVez.classList.remove('visible');
    tarjeta.classList.remove('oculta');
    tarjeta.scrollTop = 0;
    await esperar(700);
    await this.#escribir(mensaje, this.config.mensaje);
    await esperar(400);
    firma.classList.add('visible');
    await esperar(1200);
    otraVez.classList.add('visible');
  }

  ocultarTarjeta() {
    this.escribiendo?.saltar();
    this.el.tarjeta.classList.add('oculta');
  }

  /** Efecto máquina de escribir, letra por letra. */
  #escribir(elemento, texto) {
    return new Promise((resolver) => {
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      const nodo = document.createTextNode('');
      elemento.append(nodo, cursor);
      const letras = Array.from(texto); // respeta emojis
      let i = 0, temporizador = 0, terminado = false;

      const terminar = () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        nodo.textContent = texto;
        cursor.remove();
        this.escribiendo = null;
        resolver();
      };
      this.escribiendo = { saltar: terminar };

      if (this.movimientoReducido) { terminar(); return; }

      const siguiente = () => {
        if (i >= letras.length) return terminar();
        const letra = letras[i++];
        nodo.textContent += letra;
        // Mantener visible la última línea si la tarjeta tiene scroll
        const t = this.el.tarjeta;
        if (t.scrollHeight > t.clientHeight) t.scrollTop = t.scrollHeight;
        let pausa = 34 + Math.random() * 30;
        if ('.!?…'.includes(letra)) pausa = 380;
        else if (',;:'.includes(letra)) pausa = 180;
        else if (letra === '\n') pausa = 260;
        temporizador = setTimeout(siguiente, pausa);
      };
      siguiente();
    });
  }

  alPedirOtraVez(fn) {
    this.el.otraVez.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }

  // ---------- recuerdos flotantes ----------

  /**
   * Muestra los recuerdos uno a uno, flotando cerca de la rosa, en ciclo.
   * @param {() => {x:number,y:number}[]} obtenerPosiciones  posiciones en pantalla (px) junto a la rosa
   */
  async mostrarRecuerdos(obtenerPosiciones) {
    const lista = (this.config.recuerdos || []).filter((r) => r && r.trim());
    if (!lista.length) return;
    const ciclo = ++this.cicloRecuerdos;
    const capa = this.el.recuerdos;
    let i = 0;
    while (ciclo === this.cicloRecuerdos) {
      const texto = lista[i % lista.length];
      const posiciones = obtenerPosiciones();
      const p = posiciones[i % posiciones.length];
      const chip = document.createElement('div');
      chip.className = 'recuerdo';
      chip.textContent = texto;
      capa.append(chip);
      // Centrar sobre el punto y mantener dentro de la pantalla
      const ancho = chip.offsetWidth, alto = chip.offsetHeight;
      const margen = 12;
      const x = Math.min(innerWidth - ancho - margen, Math.max(margen, p.x - ancho / 2));
      const y = Math.min(p.limiteY - alto - margen, Math.max(margen + 40, p.y - alto / 2));
      chip.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(() => chip.classList.add('visible'));
      setTimeout(() => chip.classList.add('saliendo'), 4200);
      setTimeout(() => chip.remove(), 5600);
      i++;
      await esperar(lista.length === 1 ? 6500 : 2600);
    }
  }

  detenerRecuerdos() {
    this.cicloRecuerdos++;
    this.el.recuerdos.querySelectorAll('.recuerdo').forEach((c) => c.classList.add('saliendo'));
  }

  /** Altura (px) desde arriba hasta donde empieza la tarjeta, para no tapar el texto. */
  limiteSuperiorTarjeta() {
    const r = this.el.tarjeta.getBoundingClientRect();
    return this.el.tarjeta.classList.contains('oculta') || r.left > innerWidth * 0.4 ? innerHeight : r.top;
  }
}
