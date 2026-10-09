# 💜 Flores moradas para Lis

Página web estática con un ramo de flores 3D (tulipanes, lirios y lavanda) generado con
Three.js, que florece al abrirla. Está hecha para GitHub Pages: HTML + CSS + JavaScript,
sin paso de build.

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
| `recuerdos`  | Lista de frases que flotan junto al ramo. `[]` para no mostrar ninguna    |
| `musica`     | Nombre del `.mp3` dentro de `assets/audio/`. `''` para no usar música     |
| `volumen`    | Volumen de la música, de `0` a `1`                                         |

Ejemplo de recuerdos:

```js
recuerdos: ['el café de la plaza', 'la vez que nos perdimos en Puno'],
```

### Agregar música

1. Copia tu canción a `assets/audio/` (por ejemplo `assets/audio/cancion.mp3`).
   Mejor si pesa menos de ~5 MB para que cargue rápido en el celular.
2. En `config.js` pon `musica: 'cancion.mp3',`
3. La música empieza cuando ella toca "toca para abrir" (los navegadores no dejan
   reproducir audio sin un toque). Aparece un botón arriba a la derecha para silenciarla.

### Vista previa al compartir por WhatsApp

WhatsApp no ejecuta JavaScript, así que el título y la imagen de la vista previa están
escritos directamente en `index.html` (etiquetas `og:`). Si cambias el nombre, edita también:

- `<title>` y `og:title` en `index.html`
- `og:url` y `og:image`: deben ser la URL **completa** de tu página. Si tu repositorio o
  usuario se llaman distinto, cámbialos ahí.

La imagen es `preview.png` (1200×630). Para regenerarla después de cambiar algo, con el
servidor local corriendo:

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=10000 \
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
- `?captura` — ramo ya abierto con el título grande, para la imagen de vista previa.
- `?debug` — expone `__avanzar(segundos)` en la consola para adelantar la animación.

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
index.html         Estructura, meta tags, importmap de Three.js
config.js          ← TEXTOS EDITABLES
css/styles.css     Estilos (móvil primero, tarjeta de vidrio esmerilado)
js/main.js         Escena, cámara, luces, bloom, flujo de la experiencia
js/flowers.js      Flores 3D procedurales, florecimiento y brisa
js/particles.js    Estrellas, pétalos cayendo, luciérnagas y explosión al tocar
js/ui.js           Pantallas, máquina de escribir, recuerdos y música
assets/audio/      Aquí va la música (opcional)
favicon.svg        Florcita morada
preview.png        Imagen para compartir el link
```

## Detalles técnicos

- Three.js 0.170 por CDN con `importmap`; todas las rutas son relativas (`./`).
- Pétalos, hojas, estambres y botones de lavanda usan `InstancedMesh` con morph targets
  por instancia (cada pétalo cambia de forma mientras se abre).
- Brillo de borde (fresnel) y falsa translucidez inyectados en `MeshStandardMaterial`.
- Bloom suave (`UnrealBloomPass`) que se apaga solo si el equipo no llega a ~45 FPS;
  si aún va lento, baja la resolución.
- `devicePixelRatio` limitado a 2, menos partículas en celular, render en pausa cuando la
  pestaña no está visible.
- Respeta `prefers-reduced-motion`: sin giro automático, menos partículas, brisa más
  suave y el mensaje aparece completo sin la máquina de escribir.
- Giroscopio para el parallax en celular (pide permiso en iOS al tocar "abrir").
