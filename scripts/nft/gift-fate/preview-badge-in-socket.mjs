/**
 * Preview: place G2Ushard.png into Fate badge socket (no mint).
 *
 *   node preview-badge-in-socket.mjs [common|rare|epic|legendary]
 */
import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const rarity = (process.argv[2] || "common").toLowerCase();
const basePath = path.join(dir, `Fate-${rarity}.jpg`);
const shardPath = path.join(
  dir,
  "../../../public/shop/G2Ushard.png",
);

if (!fs.existsSync(basePath)) throw new Error(`Missing ${basePath}`);
if (!fs.existsSync(shardPath)) throw new Error(`Missing ${shardPath}`);

const base = await Jimp.read(basePath);
const W = base.bitmap.width;
const H = base.bitmap.height;

// Same geometry as make-borders.mjs (border + socket on art, then outer frame)
const border = Math.max(12, Math.round(Math.min(W, H) * (17 / 1442)));
const artSide = W - border * 2;
const socketR = Math.max(18, Math.round(artSide * 0.028));
const socketMargin = Math.max(14, Math.round(artSide * 0.03));
// center of socket in FINAL (bordered) coords
const cx = border + (artSide - socketMargin - socketR);
const cy = border + (artSide - socketMargin - socketR);
// Fill most of the socket (was 0.88 — too small). Leave a thin ring edge.
const badgeR = Math.round(socketR * 1.15);
const badgeSize = badgeR * 2;

console.log({ W, H, border, socketR, badgeR, cx, cy });

let shard = await Jimp.read(shardPath);
// contain inside circle
shard = shard.cover(badgeSize, badgeSize);

// Circular alpha mask
const mask = new Jimp(badgeSize, badgeSize, 0x00000000);
const mid = badgeR;
for (let y = 0; y < badgeSize; y++) {
  for (let x = 0; x < badgeSize; x++) {
    const dx = x + 0.5 - mid;
    const dy = y + 0.5 - mid;
    if (dx * dx + dy * dy <= badgeR * badgeR) {
      mask.setPixelColor(0xffffffff, x, y);
    }
  }
}
shard.mask(mask, 0, 0);

// Soft dark disc under badge so it reads as sitting in the socket
const under = new Jimp(badgeSize, badgeSize, 0x00000000);
for (let y = 0; y < badgeSize; y++) {
  for (let x = 0; x < badgeSize; x++) {
    const dx = x + 0.5 - mid;
    const dy = y + 0.5 - mid;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= badgeR) {
      const a = Math.round(180 * (1 - d / badgeR) * 0.35 + 90);
      under.setPixelColor(Jimp.rgbaToInt(0, 0, 0, Math.min(200, a)), x, y);
    }
  }
}

const out = base.clone();
const x0 = Math.round(cx - badgeR);
const y0 = Math.round(cy - badgeR);
out.composite(under, x0, y0, {
  mode: Jimp.BLEND_SOURCE_OVER,
  opacitySource: 1,
  opacityDest: 1,
});
out.composite(shard, x0, y0, {
  mode: Jimp.BLEND_SOURCE_OVER,
  opacitySource: 1,
  opacityDest: 1,
});

// Crisp ring on top so the socket edge stays visible
for (let y = cy - socketR - 3; y <= cy + socketR + 3; y++) {
  for (let x = cx - socketR - 3; x <= cx + socketR + 3; x++) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
    const dx = xi + 0.5 - cx;
    const dy = yi + 0.5 - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - socketR) < 1.6) {
      out.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 255), xi, yi);
    } else if (Math.abs(d - (socketR - 2.2)) < 1.0) {
      out.setPixelColor(Jimp.rgbaToInt(200, 200, 210, 220), xi, yi);
    }
  }
}

const outPath = path.join(dir, `Fate-${rarity}-badge-preview.jpg`);
await out.quality(95).writeAsync(outPath);

// Also copy to public for easy browser view
const pubDir = path.join(dir, "../../../public/nft/fate");
fs.mkdirSync(pubDir, { recursive: true });
const pubPath = path.join(pubDir, `Fate-${rarity}-badge-preview.jpg`);
fs.copyFileSync(outPath, pubPath);

console.log("wrote", outPath);
console.log("public", pubPath);
