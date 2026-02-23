const { MARD221_COLORS } = require("./mard221");

const FINE_PALETTE = (MARD221_COLORS || [])
  .filter((item) => item && item.rgb && item.hex)
  .map((item) => ({
    code: item.code || item.name || "",
    hex: item.hex.toUpperCase(),
    rgb: item.rgb
  }));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveGridSize(sizeMode, width, height) {
  if (sizeMode === "small") return 32;
  const shortEdge = Math.min(width || 0, height || 0);
  if (shortEdge >= 1600) return 72;
  if (shortEdge >= 1200) return 64;
  return 52;
}

function distanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function nearestPaletteColor(target, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const candidate = palette[i];
    const dist = distanceSq(target, candidate.rgb);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
    }
  }
  return best;
}

function quantizeToPalette(rawPixels, palette = FINE_PALETTE) {
  const safePalette = Array.isArray(palette) && palette.length ? palette : FINE_PALETTE;
  const total = Math.floor((rawPixels && rawPixels.length ? rawPixels.length : 0) / 4);
  const hexGrid = new Array(total);
  const codeGrid = new Array(total);
  const counts = Object.create(null);

  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    const alpha = rawPixels[offset + 3];
    if (alpha === 0) {
      const white = "#FFFFFF";
      hexGrid[i] = white;
      codeGrid[i] = "白";
      counts[white] = (counts[white] || 0) + 1;
      continue;
    }

    const nearest = nearestPaletteColor(
      {
        r: rawPixels[offset],
        g: rawPixels[offset + 1],
        b: rawPixels[offset + 2]
      },
      safePalette
    );

    hexGrid[i] = nearest.hex;
    codeGrid[i] = nearest.code || "";
    counts[nearest.hex] = (counts[nearest.hex] || 0) + 1;
  }

  return {
    hexGrid,
    codeGrid,
    counts
  };
}

function formatGridDate(date = new Date()) {
  const now = new Date(date);
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const hour = `${now.getHours()}`.padStart(2, "0");
  const minute = `${now.getMinutes()}`.padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function buildBeadEstimate(gridSize, counts) {
  const total = clamp(gridSize * gridSize, 0, 99999);
  const colorUsed = Object.keys(counts || {}).length;
  return {
    total,
    colorUsed
  };
}

module.exports = {
  FINE_PALETTE,
  resolveGridSize,
  quantizeToPalette,
  formatGridDate,
  buildBeadEstimate
};
