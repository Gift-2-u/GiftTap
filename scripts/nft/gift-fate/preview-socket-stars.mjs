/**
 * Exact Fate-common.jpg + slightly bigger opaque socket + star1 / star2 previews.
 * Pixel-perfect base (no AI redraw).
 *
 *   node preview-socket-stars.mjs
 */
import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  BADGE_BLEND,
  socketMetricsFromBorderedCard,
} from "./socket-geometry.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const basePath = path.join(dir, "../../../public/nft/fate/Fate-common.jpg");
const star1Path = "/mnt/c/Users/clato/OneDrive/gift/socket star1.jpg";
const star2Path = "/mnt/c/Users/clato/OneDrive/gift/socket star2.jpg";
const outDir = path.join(dir, "../../../public/nft/fate/socket-previews");
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(basePath)) throw new Error(`Missing ${basePath}`);
if (!fs.existsSync(star1Path)) throw new Error(`Missing ${star1Path}`);
if (!fs.existsSync(star2Path)) throw new Error(`Missing ${star2Path}`);

const base = await Jimp.read(basePath);
const W = base.bitmap.width;
const H = base.bitmap.height;

const { border, socketR, socketStroke: stroke, cx, cy, badgeR: badgeRLocked } =
  socketMetricsFromBorderedCard(W, H);

console.log({ W, H, border, socketR, cx, cy, stroke, badgeRLocked });

function paintOpaqueSocket(img, cx, cy, r, stroke) {
  const out = img.clone();
  for (let y = Math.floor(cy - r - stroke - 2); y <= Math.ceil(cy + r + stroke + 2); y++) {
    for (let x = Math.floor(cx - r - stroke - 2); x <= Math.ceil(cx + r + stroke + 2); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r - stroke * 0.35) {
        // solid socket well — no street bleed
        out.setPixelColor(Jimp.rgbaToInt(8, 8, 12, 255), x, y);
      } else if (d <= r + stroke * 0.55) {
        // metallic rim
        const t = (d - (r - stroke * 0.35)) / (stroke * 0.9);
        const g = Math.round(210 - t * 40);
        out.setPixelColor(Jimp.rgbaToInt(g, g, Math.min(255, g + 8), 255), x, y);
      }
      // crisp edges
      if (Math.abs(d - r) < 0.9) {
        out.setPixelColor(Jimp.rgbaToInt(245, 245, 250, 255), x, y);
      }
      if (Math.abs(d - (r - stroke * 0.55)) < 0.75) {
        out.setPixelColor(Jimp.rgbaToInt(40, 40, 48, 255), x, y);
      }
    }
  }
  return out;
}

async function circularBadge(srcPath, size) {
  let badge = await Jimp.read(srcPath);
  // Stars are often portrait screenshots — cover then circle-crop
  badge = badge.cover(size, size);
  // Match Fate card mood: darker, less punchy than raw star art
  badge.brightness(BADGE_BLEND.brightness);
  badge.contrast(BADGE_BLEND.contrast);
  // Soft circular alpha: full in center, fade near rim so it nests in the socket
  const mask = new Jimp(size, size, 0x00000000);
  const mid = size / 2;
  const rr = size / 2;
  const fadeStart = rr * BADGE_BLEND.fadeStartFrac;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - mid;
      const dy = y + 0.5 - mid;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rr) continue;
      let a = 255;
      if (d > fadeStart) {
        a = Math.round(255 * (1 - (d - fadeStart) / (rr - fadeStart)));
      }
      // slight overall alpha so star sits under Fate lighting
      a = Math.round(a * BADGE_BLEND.alphaMul);
      mask.setPixelColor(Jimp.rgbaToInt(255, 255, 255, a), x, y);
    }
  }
  badge.mask(mask, 0, 0);
  return badge;
}

async function writeWithStar(emptyCard, starPath, outName) {
  const badgeR = badgeRLocked;
  const badgeSize = badgeR * 2;
  const badge = await circularBadge(starPath, badgeSize);
  const out = emptyCard.clone();
  const x0 = Math.round(cx - badgeR);
  const y0 = Math.round(cy - badgeR);
  // Soft dark disc under star so it reads as recessed in the socket
  const under = new Jimp(badgeSize, badgeSize, 0x00000000);
  const mid = badgeR;
  for (let y = 0; y < badgeSize; y++) {
    for (let x = 0; x < badgeSize; x++) {
      const dx = x + 0.5 - mid;
      const dy = y + 0.5 - mid;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= badgeR) {
        const fall = 1 - d / badgeR;
        const a = Math.round(70 + 90 * fall);
        under.setPixelColor(Jimp.rgbaToInt(0, 0, 0, Math.min(160, a)), x, y);
      }
    }
  }
  out.composite(under, x0, y0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1,
  });
  out.composite(badge, x0, y0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: BADGE_BLEND.opacitySource,
    opacityDest: 1,
  });
  // thin ring on top so socket edge stays readable
  for (let y = Math.floor(cy - socketR - 2); y <= Math.ceil(cy + socketR + 2); y++) {
    for (let x = Math.floor(cx - socketR - 2); x <= Math.ceil(cx + socketR + 2); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - socketR) < 1.1) {
        out.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 255), x, y);
      }
    }
  }
  const outPath = path.join(outDir, outName);
  await out.quality(95).writeAsync(outPath);
  console.log("wrote", outPath);
  return outPath;
}

const empty = paintOpaqueSocket(base, cx, cy, socketR, stroke);
const emptyPath = path.join(outDir, "Fate-common-socket-empty-bigger.jpg");
await empty.quality(95).writeAsync(emptyPath);
console.log("wrote", emptyPath);

await writeWithStar(empty, star1Path, "Fate-common-socket-star1.jpg");
await writeWithStar(empty, star2Path, "Fate-common-socket-star2.jpg");

// Also copy to OneDrive gift for easy viewing
const giftDir = "/mnt/c/Users/clato/OneDrive/gift";
for (const name of [
  "Fate-common-socket-empty-bigger.jpg",
  "Fate-common-socket-star1.jpg",
  "Fate-common-socket-star2.jpg",
]) {
  fs.copyFileSync(path.join(outDir, name), path.join(giftDir, name));
}
console.log("copied to OneDrive/gift");
console.log("done");
