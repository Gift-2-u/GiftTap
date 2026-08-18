/**
 * Square art + square rarity border + empty badge socket (bottom-right).
 * Design: thin ~12px border; socket same corner for every elf.
 * Socket geometry: ./socket-geometry.mjs (LOCKED — opaque well, tips clear rim).
 */
import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  BORDER_FRAC,
  socketMetricsFromArtSide,
} from "./socket-geometry.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(dir, "Rush.jpg");
if (!fs.existsSync(srcPath)) throw new Error("Missing Rush.jpg");

const base = await Jimp.read(srcPath);
// Force square canvas (center crop if needed) so border stays square
const side = Math.min(base.bitmap.width, base.bitmap.height);
const sx = Math.floor((base.bitmap.width - side) / 2);
const sy = Math.floor((base.bitmap.height - side) / 2);
const square = base.clone().crop(sx, sy, side, side);

const border = Math.max(12, Math.round(side * BORDER_FRAC)); // thin, design ~12px
const { socketR, socketStroke, socketMargin, cx, cy } =
  socketMetricsFromArtSide(square.bitmap.width);

const colors = {
  common: { border: 0xc0c0c0ff, label: "Common" }, // silver/grey
  rare: { border: 0x3b82f6ff, label: "Rare" },
  epic: { border: 0xa855f7ff, label: "Epic" },
  legendary: { border: 0xeab308ff, label: "Legendary" },
};

/**
 * Draw empty badge socket — opaque dark well (no street bleed) + metallic rim.
 * Locked look for Fate + future elves.
 */
function drawEmptySocket(img, cx, cy, r, stroke) {
  for (let y = Math.floor(cy - r - stroke - 2); y <= Math.ceil(cy + r + stroke + 2); y++) {
    for (let x = Math.floor(cx - r - stroke - 2); x <= Math.ceil(cx + r + stroke + 2); x++) {
      if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r - stroke * 0.35) {
        // solid socket well — no background showing through
        img.setPixelColor(Jimp.rgbaToInt(8, 8, 12, 255), x, y);
      } else if (d <= r + stroke * 0.55) {
        const t = (d - (r - stroke * 0.35)) / (stroke * 0.9 || 1);
        const g = Math.round(210 - Math.min(1, Math.max(0, t)) * 40);
        img.setPixelColor(Jimp.rgbaToInt(g, g, Math.min(255, g + 8), 255), x, y);
      }
      if (Math.abs(d - r) < 0.9) {
        img.setPixelColor(Jimp.rgbaToInt(245, 245, 250, 255), x, y);
      }
      if (Math.abs(d - (r - stroke * 0.55)) < 0.75) {
        img.setPixelColor(Jimp.rgbaToInt(40, 40, 48, 255), x, y);
      }
    }
  }
}

for (const [name, { border: borderColor }] of Object.entries(colors)) {
  const art = square.clone();
  // badge socket on art (before border) — bottom-right of art
  drawEmptySocket(art, cx, cy, socketR, socketStroke);

  const w = art.bitmap.width + border * 2;
  const h = art.bitmap.height + border * 2;
  // square outer frame
  const out = new Jimp(w, h, borderColor);
  out.composite(art, border, border);

  const p = path.join(dir, `Rush-${name}.jpg`);
  await out.quality(95).writeAsync(p);
  console.log(
    "wrote",
    path.basename(p),
    `${w}x${h}`,
    "border_px",
    border,
    "socket_r",
    socketR,
    "square",
    w === h,
  );
}

// Sync to public shop art
const pubDir = path.join(dir, "../../../public/nft/rush");
fs.mkdirSync(pubDir, { recursive: true });
for (const name of Object.keys(colors)) {
  const src = path.join(dir, `Rush-${name}.jpg`);
  const dst = path.join(pubDir, `Rush-${name}.jpg`);
  fs.copyFileSync(src, dst);
  console.log("public", path.basename(dst));
}

console.log("done — Rush borders + locked socket (from socket-geometry.mjs)");
