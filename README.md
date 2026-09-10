# Bombos Voley

App 100% frontend (sin backend) para armar equipos al azar y balanceados por
nivel para entrenos de voleibol. Guarda todo en `localStorage` del navegador
y funciona como PWA instalable, con soporte offline.

## Archivos

- `index.html` — estructura de la app
- `style.css` — estilos (mobile-first, escala a escritorio)
- `app.js` — lógica: bombos, sorteo de equipos, persistencia
- `manifest.json` — metadatos de instalación (PWA)
- `sw.js` — service worker (cachea la app para uso offline)
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `icon-180.png` — íconos

## Probarla en local

Los service workers necesitan `http://` o `https://` — no funcionan abriendo
`index.html` directo con doble clic (`file://`). Levanta un servidor simple
desde esta carpeta:

```bash
# con Python (ya viene instalado en Mac/Linux)
python3 -m http.server 8080

# o con Node
npx serve .
```

Luego abre `http://localhost:8080` en el navegador del celular o la compu
(si es en el celular, usa la IP de tu compu en la misma red, ej.
`http://192.168.1.5:8080`).

## Instalar en el celular

- **Android (Chrome):** abre la URL, toca el menú ⋮ → "Agregar a pantalla de
  inicio" (o el banner de instalación que aparece solo).
- **iPhone (Safari):** abre la URL, toca el ícono de compartir (□↑) →
  "Agregar a pantalla de inicio".

## Desplegar gratis

**GitHub Pages:** sube estos archivos a un repo, entra a Settings → Pages,
elige la rama y carpeta raíz, y listo — te da una URL `https://tuusuario.github.io/tu-repo/`.

**Netlify:** arrastra la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop)
y te da una URL al instante.

Cualquiera de las dos sirve por `https://`, así que el service worker y el
"Agregar a pantalla de inicio" funcionan sin configuración extra.

## Notas

- Los bombos, la cantidad de equipos y el último sorteo se guardan solos en
  `localStorage`. "Limpiar todo" borra todo y pide confirmación antes.
- El sorteo reparte cada tier de forma aleatoria y rotativa entre los
  equipos; si un tier no alcanza para repartir igual, la app avisa qué
  equipos quedarán con uno más en ese nivel.
- Si actualizas los archivos después de haber instalado la app, el service
  worker usa un cache versionado (`CACHE_NAME` en `sw.js`) — sube ese número
  cuando publiques cambios para que los celulares bajen la versión nueva.
