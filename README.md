# 💜 Una rosa morada para Lis

Página web estática donde una rosa morada real se abre ante sus ojos (video time-lapse)
en medio de una noche violeta con estrellas, bokeh, pétalos que caen y luciérnagas.
Está hecha para GitHub Pages: HTML + CSS + JavaScript, sin paso de build.

**Link:** https://cristhianqus2425-source.github.io/Lis/

## Personalizar (solo `config.js`)

Todo el texto está en [`config.js`](./config.js). Ábrelo, cambia lo que está entre comillas,
guarda y sube los cambios.

| Campo        | Qué hace                                                                 |
|--------------|--------------------------------------------------------------------------|
| `para`       | Nombre de la pantalla de inicio: "Para **Lis** 💜"                        |
| `nombre`     | Su nombre completo (se usa en la accesibilidad de la tarjeta)            |
| `firma`      | Tu firma al final: "— Cristhian"                                         |
| `titulo`     | Título de la tarjeta                                                     |
| `mensaje`    | El mensaje que se escribe letra por letra. Usa `\n` para saltos de línea  |
| `recuerdos`  | Lista de frases que flotan junto a la rosa. `[]` para no mostrar ninguna  |
| `musica`     | Nombre del `.mp3` o `.m4a` dentro de `assets/audio/`. `''` para no usar música |
| `volumen`    | Volumen de la música, de `0` a `1`                                         |

Ejemplo de recuerdos:

```js
recuerdos: ['el café de la plaza', 'la vez que nos perdimos en Puno'],
```

### Agregar música

1. Copia tu canción a `assets/audio/` (por ejemplo `assets/audio/cancion.mp3`; también sirve `.m4a`).
   Mejor si pesa menos de ~5 MB para que cargue rápido en el celular.
2. En `config.js` pon `musica: 'cancion.mp3',`
3. La música empieza cuando ella toca "toca para abrir" (los navegadores no dejan
   reproducir audio sin un toque). Aparece un botón arriba a la derecha para silenciarla.

### Vista previa al compartir por WhatsApp

WhatsApp no ejecuta JavaScript, así que el título y la imagen de la vista previa están
escritos directamente en `index.html` (etiquetas `og:`). Si cambias el nombre, edita también:

- `<title>`, `og:title` y `#titulo-captura` en `index.html`
- `og:url` y `og:image`: deben ser la URL **completa** de tu página. Si tu repositorio o
  usuario se llaman distinto, cámbialos ahí.

La imagen es `preview.png` (1200×630). Para regenerarla después de cambiar algo, con el
servidor local corriendo:

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot=preview.png "http://localhost:8765/?captura"
```

(o abre `http://localhost:8765/?captura` con la ventana a 1200×630 y toma una captura).
El texto grande de la imagen está en `#titulo-captura` dentro de `index.html`.

> WhatsApp guarda en caché la vista previa. Si la cambiaste y no se actualiza, comparte el
> link con algo al final, por ejemplo `.../Lis/?v=2`.

## Probar en tu computadora

Los módulos de JavaScript no funcionan abriendo el archivo con doble clic; hace falta un
servidor local. Desde esta carpeta:

```bash
npx serve -l 8765 .
```

y abre http://localhost:8765. Para verla como celular: F12 → ícono de teléfono
(modo dispositivo) → elige un iPhone o Android en vertical.

Parámetros útiles en la URL (solo para probar):

- `?auto` — empieza sin tener que tocar la pantalla de inicio.
- `?captura` — flor ya abierta con el título grande, para la imagen de vista previa.

## Publicar en GitHub Pages

1. Sube el código: `git push -u origin main`
2. En GitHub, entra al repositorio → **Settings** → **Pages**.
3. En **Build and deployment** → **Source** elige **Deploy from a branch**.
4. En **Branch** elige `main` y la carpeta `/ (root)` → **Save**.
5. Espera 1–2 minutos y recarga esa página: aparecerá el link
   `https://<usuario>.github.io/<repositorio>/`.

Cada vez que hagas `git push`, la página se actualiza sola en uno o dos minutos.

## Estructura

```
index.html            Estructura, capas, meta tags, importmap de Three.js
config.js             ← TEXTOS EDITABLES
css/styles.css        Estilos: capas, mezcla del video, rayos, grano, tarjeta de vidrio
js/main.js            Orquesta las capas, el parallax y el flujo de la experiencia
js/fondo.js           Capa trasera (canvas 2D): estrellas y bokeh
js/flor.js            Capa central: el video de la flor abriéndose
js/particles.js       Capa delantera (Three.js): pétalos, luciérnagas, explosión al tocar
js/ui.js              Pantallas, máquina de escribir, recuerdos y música
assets/video/         La rosa en versión vertical (celular) y horizontal (laptop)
assets/audio/         Aquí va la música (opcional)
favicon.svg           Florcita morada
preview.png           Imagen para compartir el link
```

## Cómo funciona (2.5D)

La página se arma con capas que se mueven distinto al inclinar el celular (giroscopio) o
mover el mouse, lo que da sensación de profundidad:

1. **Fondo** (canvas 2D): cielo con estrellas que titilan y luces desenfocadas (bokeh).
2. **Flor** (video): el video tiene fondo negro y se dibuja con `mix-blend-mode: lighten`,
   así el negro desaparece y la rosa flota sobre la noche. Los bordes se difuminan
   con una máscara. Se carga solo la versión que corresponde a la pantalla (~2,4 MB).
3. **Partículas** (Three.js transparente): pétalos que caen, luciérnagas y la explosión
   de pétalos al tocar.
4. **Acabado** (CSS): rayos de luz, viñeta y grano de película.

Si el video no carga, se muestra una foto de la rosa abierta. Respeta
`prefers-reduced-motion` (sin parallax, menos partículas, mensaje sin máquina de escribir)
y pausa todo cuando la pestaña no está visible.

## Créditos

Video original de la rosa: ["Time-lapse of opening red rose isolated on black background"](https://commons.wikimedia.org/wiki/File:Time-lapse_of_opening_red_rose_isolated_on_black_background.Blooming_red_roses_flower_buds.webm)
de **Alex Tr**, en Wikimedia Commons, bajo licencia [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
Cambios: recortado, con margen negro, color pasado de rosado a morado y reproducido más lento.
La licencia pide dar crédito: por eso aparece una línea pequeña al pie de la tarjeta.
Si la quitas, deja el crédito visible en otro lugar de la página.
