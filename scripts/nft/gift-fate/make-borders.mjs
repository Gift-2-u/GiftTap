/**
 * Square art + square rarity border + empty badge socket (bottom-right).
 * Design: thin ~12px border; socket same corner for every elf.
 */
import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(dir, "Fate.jpg");
if (!fs.existsSync(srcPath)) throw new Error("Missing Fate.jpg");

const base = await Jimp.read(srcPath);
// Force square canvas (center crop if needed) so border stays square
const side = Math.min(base.bitmap.width, base.bitmap.height);
const sx = Math.floor((base.bitmap.width - side) / 2);
const sy = Math.floor((base.bitmap.height - side) / 2);
const square = base.clone().crop(sx, sy, side, side);

const border = Math.max(12, Math.round(side * 0.012)); // thin, design ~12px
const socketR = Math.max(18, Math.round(side * 0.028));
const socketStroke = Math.max(3, Math.round(side * 0.004));
const socketMargin = Math.max(14, Math.round(side * 0.03));

const colors = {
  common: { border: 0xc0c0c0ff, label: "Common" }, // silver/grey
  rare: { border: 0x3b82f6ff, label: "Rare" },
  epic: { border: 0xa855f7ff, label: "Epic" },
  legendary: { border: 0xeab308ff, label: "Legendary" },
};

/** Draw empty ring (badge socket) — transparent center, light ring */
function drawEmptySocket(img, cx, cy, r, stroke) {
  // outer ring fill
  for (let y = cy - r - stroke; y <= cy + r + stroke; y++) {
    for (let x = cx - r - stroke; x <= cx + r + stroke; x++) {
      if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      // soft dark disc behind
      if (d <= r + stroke) {
        const basePx = Jimp.intToRGBA(img.getPixelColor(x, y));
        // ring band
        if (d >= r - stroke * 0.15 && d <= r + stroke) {
          // silver-white ring edge
          const t = Math.abs(d - r) / stroke;
          const a = Math.max(0, 1 - t);
          const mix = (c, w) => Math.round(c * (1 - a * 0.85) + w * a * 0.85);
          img.setPixelColor(
            Jimp.rgbaToInt(mix(basePx.r, 230), mix(basePx.g, 230), mix(basePx.b, 235), 255),
            x,
            y,
          );
        } else if (d < r - stroke * 0.15) {
          // empty center — slight dark glass
          const a = 0.35;
          img.setPixelColor(
            Jimp.rgbaToInt(
              Math.round(basePx.r * (1 - a)),
              Math.round(basePx.g * (1 - a)),
              Math.round(basePx.b * (1 - a)),
              255,
            ),
            x,
            y,
          );
        }
      }
    }
  }
  // crisp outer/inner outline
  for (let y = cy - r - stroke; y <= cy + r + stroke; y++) {
    for (let x = cx - r - stroke; x <= cx + r + stroke; x++) {
      if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - (r + stroke * 0.55)) < 0.8 || Math.abs(d - (r - stroke * 0.55)) < 0.8) {
        img.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 255), x, y);
      }
    }
  }
}

for (const [name, { border: borderColor }] of Object.entries(colors)) {
  const art = square.clone();
  // badge socket on art (before border) — bottom-right of art
  const cx = art.bitmap.width - socketMargin - socketR;
  const cy = art.bitmap.height - socketMargin - socketR;
  drawEmptySocket(art, cx, cy, socketR, socketStroke);

  const w = art.bitmap.width + border * 2;
  const h = art.bitmap.height + border * 2;
  // square outer frame
  const out = new Jimp(w, h, borderColor);
  out.composite(art, border, border);

  const p = path.join(dir, `Fate-${name}.jpg`);
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

console.log("done");
