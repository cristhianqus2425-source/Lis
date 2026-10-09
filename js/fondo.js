// =====================================================================
//  fondo.js — Capa trasera: cielo nocturno con estrellas que titilan y
//  luces desenfocadas (bokeh), dibujadas en un canvas 2D muy liviano.
//  Se mueve un poco con el giroscopio/mouse (parallax) para dar profundidad.
// =====================================================================

const PALETA_BOKEH = ['#b57edc', '#e6ccff', '#f5d58a', '#e7b8e6', '#7b3fb5', '#ffd9f0'];

/** Pre-dibuja un círculo de bokeh (disco suave con borde de lente) en un canvas. */
function crearSpriteBokeh(color, tam = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const g = c.getContext('2d');
  const r = tam / 2;
  const relleno = g.createRadialGradient(r, r, 0, r, r, r);
  relleno.addColorStop(0, color + '30');
  relleno.addColorStop(0.75, color + '28');
  relleno.addColorStop(0.92, color + '50'); // borde un poco más brillante, como un lente real
  relleno.addColorStop(1, color + '00');
  g.fillStyle = relleno;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  return c;
}

export class Fondo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o { esMovil, movimientoReducido }
   */
  constructor(canvas, o) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = o;
    this.intensidad = 0.35; // las luces del fondo se encienden al abrirse la flor
    this.destinoIntensidad = 0.35;
    this.sprites = PALETA_BOKEH.map((c) => crearSpriteBokeh(c));
    this.ajustar();
    this.#crearEstrellas();
    this.#crearBokeh();
  }

  ajustar() {
    this.pr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.pr);
    this.canvas.height = Math.round(this.h * this.pr);
  }

  #crearEstrellas() {
    const n = this.o.esMovil ? 160 : 300;
    this.estrellas = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.pow(Math.random(), 1.4), // más densas arriba
      r: 0.4 + Math.pow(Math.random(), 5) * 1.6,
      fase: Math.random() * Math.PI * 2,
      vel: 0.6 + Math.random() * 2,
      prof: 0.2 + Math.random() * 0.3, // cuánto se mueven con el parallax
    }));
  }

  #crearBokeh() {
    const n = this.o.esMovil ? 13 : 22;
    this.bokeh = Array.from({ length: n }, (_, i) => ({
      x: Math.random(),
      y: 0.1 + Math.random() * 0.85,
      r: 12 + Math.pow(Math.random(), 2) * 48,
      sprite: this.sprites[i % this.sprites.length],
      fase: Math.random() * Math.PI * 2,
      deriva: 0.004 + Math.random() * 0.01,
      prof: 0.6 + Math.random() * 0.8,
    }));
  }

  /**
   * @param {number} dt
   * @param {number} t
   * @param {{x:number,y:number}} parallax  valores entre -1 y 1
   */
  dibujar(dt, t, parallax) {
    this.intensidad += (this.destinoIntensidad - this.intensidad) * Math.min(1, dt * 0.8);
    const { ctx, w, h, pr } = this;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const lento = this.o.movimientoReducido ? 0.3 : 1;

    // Estrellas
    ctx.fillStyle = '#f3e8ff';
    for (const e of this.estrellas) {
      const brillo = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * e.vel * lento + e.fase));
      ctx.globalAlpha = brillo * 0.85;
      const x = e.x * w - parallax.x * 14 * e.prof;
      const y = e.y * h * 0.8 - parallax.y * 10 * e.prof;
      ctx.beginPath();
      ctx.arc(x, y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bokeh: luces desenfocadas que flotan lentamente
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bokeh) {
      b.y -= b.deriva * dt * lento * 0.4;
      if (b.y < -0.15) { b.y = 1.1; b.x = Math.random(); }
      const respira = 0.7 + 0.3 * Math.sin(t * 0.5 + b.fase);
      ctx.globalAlpha = this.intensidad * respira * 0.8;
      const x = b.x * w + Math.sin(t * 0.2 + b.fase) * 20 - parallax.x * 26 * b.prof;
      const y = b.y * h - parallax.y * 18 * b.prof;
      ctx.drawImage(b.sprite, x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
