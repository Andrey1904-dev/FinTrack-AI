/* ============================================================================
   make-icons.mjs — генерация PWA-иконок без сторонних библиотек.
   Рисует тот же знак, что и favicon.svg (скруглённый квадрат с градиентом
   и белой «линией роста» со стрелкой), растрирует со сглаживанием (2x)
   и кодирует PNG вручную: IHDR/IDAT/IEND + crc32 из node:zlib.

   Зачем скрипт: manifest.webmanifest и sw.js ссылаются на icons/icon-192.png,
   icons/icon-512.png и icons/icon-maskable-512.png — они должны существовать,
   но тянуть ради трёх картинок зависимости не хочется.

   Запуск:  node scripts/make-icons.mjs
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(root, 'icons');

/* ---------- цвет ---------- */
const FROM = [0x55, 0x7d, 0xff], TO = [0x9b, 0x5c, 0xff];

/* ---------- геометрия знака (в системе 0..64, как в favicon.svg) ---------- */
const POLYLINE = [[17, 39], [28, 27], [36, 34], [49, 18]];
const ARROW = [[40, 18], [49, 18], [49, 27]];
const LINE_W = 6, ARROW_W = 5, RADIUS = 19;

function distToSegment(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}
function distToPath(px, py, pts){
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, py, ...pts[i], ...pts[i + 1]));
  return d;
}
/* расстояние со знаком до скруглённого прямоугольника (<0 внутри) */
function roundedRectDist(px, py, size, radius){
  const half = size / 2, r = radius;
  const qx = Math.abs(px - half) - (half - r), qy = Math.abs(py - half) - (half - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/* Рендер кадра size×size (координаты знака масштабируются с 64), fullBleed —
   без скругления и с большими полями (вариант maskable). */
function render(size, opts){
  const { fullBleed = false, scale = 1 } = opts || {};
  const SS = 2, big = size * SS;
  const buf = Buffer.alloc(big * big * 4);
  // знак занимает scale долю стороны; в maskable содержимое меньше (safe zone)
  const k = (size / 64) * scale, off = (size - 64 * k) / 2;
  const lineR = (LINE_W * k) / 2, arrowR = (ARROW_W * k) / 2;
  const rad = fullBleed ? 0 : RADIUS * k;
  for (let y = 0; y < big; y++){
    for (let x = 0; x < big; x++){
      const px = (x + 0.5) / SS, py = (y + 0.5) / SS;
      const ux = (px - off) / k, uy = (py - off) / k;          // координаты знака 0..64
      // фон
      const dBg = fullBleed ? -1 : roundedRectDist(px, py, size, rad);
      const aBg = Math.max(0, Math.min(1, 0.5 - dBg));
      const t = Math.max(0, Math.min(1, (px + py) / (2 * size)));
      const r = FROM[0] + (TO[0] - FROM[0]) * t, g = FROM[1] + (TO[1] - FROM[1]) * t, b = FROM[2] + (TO[2] - FROM[2]) * t;
      // белые штрихи
      const dLine = distToPath(ux, uy, POLYLINE) * k;
      const dArrow = distToPath(ux, uy, ARROW) * k;
      const aLine = Math.max(0, Math.min(1, lineR + 0.5 - dLine)) + Math.max(0, Math.min(1, arrowR + 0.5 - dArrow));
      const aW = Math.min(1, aLine);
      const i = (y * big + x) * 4;
      buf[i]     = Math.round(r + (255 - r) * aW);
      buf[i + 1] = Math.round(g + (255 - g) * aW);
      buf[i + 2] = Math.round(b + (255 - b) * aW);
      buf[i + 3] = Math.round(255 * (fullBleed ? 1 : aBg));
    }
  }
  // усреднение 2x2 → size×size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      for (let c = 0; c < 4; c++){
        const s =
          buf[((y * 2) * big + x * 2) * 4 + c] + buf[((y * 2) * big + x * 2 + 1) * 4 + c] +
          buf[((y * 2 + 1) * big + x * 2) * 4 + c] + buf[((y * 2 + 1) * big + x * 2 + 1) * 4 + c];
        out[(y * size + x) * 4 + c] = Math.round(s / 4);
      }
    }
  }
  return out;
}

/* ---------- минимальный PNG-кодировщик ---------- */
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;   // 8 бит, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++){
    raw[y * (size * 4 + 1)] = 0;  // фильтр None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, { scale: 1 }],
  ['icon-512.png', 512, { scale: 1 }],
  ['icon-maskable-512.png', 512, { fullBleed: true, scale: 0.72 }]
];
for (const [name, size, opts] of jobs){
  const png = encodePNG(render(size, opts), size);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(name, size + 'x' + size, (png.length / 1024).toFixed(1) + ' КБ');
}
console.log('Готово: icons/ обновлены.');
