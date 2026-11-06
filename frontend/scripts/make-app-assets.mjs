// Renders the FuelGo icon and splash sources into ./assets for @capacitor/assets.
//   node scripts/make-app-assets.mjs && npx capacitor-assets generate --android
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const NAVY = '#0f1f3d'
const AMBER = '#f59e0b'

// Fuel pump glyph drawn on a 1024 canvas, centred inside the adaptive-icon safe zone.
const pump = (color, hole) => `
  <g transform="translate(512 512) scale(13) translate(-24 -24)">
    <rect x="9" y="7" width="20" height="34" rx="4" fill="${color}"/>
    <rect x="13" y="12" width="12" height="9" rx="2" fill="${hole}"/>
    <rect x="7" y="38" width="24" height="5" rx="2.5" fill="${color}"/>
    <path d="M29 16h4a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0 5 0V18l-5-5" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`

const svg = (body, bg = 'none') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
     ${bg !== 'none' ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`)

const splash = (bg, fg, text) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
     <rect width="2732" height="2732" fill="${bg}"/>
     <rect x="1166" y="1016" width="400" height="400" rx="96" fill="${AMBER}"/>
     <g transform="translate(1366 1216) scale(5.2) translate(-24 -24)">
       <rect x="9" y="7" width="20" height="34" rx="4" fill="${NAVY}"/>
       <rect x="13" y="12" width="12" height="9" rx="2" fill="${AMBER}"/>
       <rect x="7" y="38" width="24" height="5" rx="2.5" fill="${NAVY}"/>
       <path d="M29 16h4a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0 5 0V18l-5-5" fill="none" stroke="${NAVY}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
     </g>
     <text x="1366" y="1590" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="120" font-weight="800" fill="${fg}">Fuel<tspan fill="${AMBER}">Go</tspan></text>
     <text x="1366" y="1690" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" fill="${text}">Fuel &amp; mechanic help, on the way</text>
   </svg>`)

mkdirSync('assets', { recursive: true })
const out = (name, buf) => sharp(buf).png().toFile(`assets/${name}`).then(() => console.log('wrote assets/' + name))

await Promise.all([
  // legacy square icon: amber rounded tile on navy
  out('icon-only.png', svg(`<rect x="112" y="112" width="800" height="800" rx="180" fill="${AMBER}"/>${pump(NAVY, AMBER)}`, NAVY)),
  // adaptive icon layers
  out('icon-foreground.png', svg(`<rect x="262" y="262" width="500" height="500" rx="120" fill="${AMBER}"/><g transform="translate(512 512) scale(0.62) translate(-512 -512)">${pump(NAVY, AMBER)}</g>`)),
  out('icon-background.png', svg('', NAVY)),
  out('splash.png', splash(NAVY, '#ffffff', '#cbd5e1')),
  out('splash-dark.png', splash('#0a1222', '#ffffff', '#a6b3cc')),
])
