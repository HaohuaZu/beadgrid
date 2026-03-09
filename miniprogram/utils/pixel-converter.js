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

function tuneSampleColor(sample, options = {}) {
  const contrastBoost = clamp(Number(options.contrastBoost) || 1, 0.8, 1.45);
  const saturationBoost = clamp(Number(options.saturationBoost) || 1, 0.8, 1.5);
  const shadowBoost = clamp(Number(options.shadowBoost) || 0, 0, 0.28);
  const neutralDarkBias = clamp(Number(options.neutralDarkBias) || 0, 0, 0.4);
  let r = Number(sample && sample.r) || 0;
  let g = Number(sample && sample.g) || 0;
  let b = Number(sample && sample.b) || 0;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);

  r = (r - 128) * contrastBoost + 128;
  g = (g - 128) * contrastBoost + 128;
  b = (b - 128) * contrastBoost + 128;

  const boostedLum = 0.299 * r + 0.587 * g + 0.114 * b;
  r = boostedLum + (r - boostedLum) * saturationBoost;
  g = boostedLum + (g - boostedLum) * saturationBoost;
  b = boostedLum + (b - boostedLum) * saturationBoost;

  if (shadowBoost > 0 && boostedLum < 190) {
    const darkFactor = 1 - shadowBoost * clamp((190 - boostedLum) / 190, 0, 1);
    r *= darkFactor;
    g *= darkFactor;
    b *= darkFactor;
  }

  if (neutralDarkBias > 0 && boostedLum < 165 && chroma < 78) {
    const mix = neutralDarkBias
      * clamp((165 - boostedLum) / 120, 0, 1)
      * clamp((78 - chroma) / 78, 0, 1);
    const neutral = boostedLum * 0.78;
    r = r * (1 - mix) + neutral * mix;
    g = g * (1 - mix) + neutral * mix;
    b = b * (1 - mix) + neutral * mix;
  }

  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255)
  };
}

function resolveGridSize(sizeMode, width, height) {
  if (sizeMode === "small") return 32;
  const shortEdge = Math.min(width || 0, height || 0);
  if (shortEdge >= 1600) return 72;
  if (shortEdge >= 1200) return 64;
  return 52;
}

function colorDistance(a, b) {
  // Use a balanced perceptual color distance that preserves both hue and lightness.
  // Key insight: we need to match hue accurately while respecting the original lightness range.
  
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  
  // 1. Standard perceptually-weighted RGB distance (primary metric)
  // This naturally handles both hue and lightness
  const rMean = (a.r + b.r) / 2;
  const weightedDist = (2 + rMean / 256) * dr * dr 
                     + 4 * dg * dg 
                     + (2 + (255 - rMean) / 256) * db * db;
  
  // 2. Hue angle calculation for better blue/green separation
  const getHue = (r, g, b) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const c = max - min;
    if (c === 0) return 0;
    let h;
    if (max === r) {
      h = ((g - b) / c) % 6;
    } else if (max === g) {
      h = (b - r) / c + 2;
    } else {
      h = (r - g) / c + 4;
    }
    return h < 0 ? h + 6 : h;
  };
  
  const hueA = getHue(a.r, a.g, a.b);
  const hueB = getHue(b.r, b.g, b.b);
  
  // Circular hue distance (0-3, where 3 is max difference)
  let hueDiff = Math.abs(hueA - hueB);
  if (hueDiff > 3) hueDiff = 6 - hueDiff;
  
  // 3. Lightness to help maintain overall brightness relationship
  const lightA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
  const lightB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
  const lightDiff = Math.abs(lightA - lightB);
  
  // 4. Combine with emphasis on hue accuracy
  // - Weighted distance handles overall color matching
  // - Hue bonus helps distinguish blue from green
  // - Lightness is only used as a mild tie-breaker
  
  // Scale hue difference to similar magnitude as weightedDist
  // Max weightedDist for pure colors is around 195075 (255^2 * 3)
  // Max hueDiff is 3, so we scale by ~40000 to make it significant
  const hueBonus = hueDiff * hueDiff * 15000;
  
  // Lightness penalty only kicks in significantly for large differences
  // This allows black lines to still match to dark colors
  const lightnessBonus = lightDiff * lightDiff * 0.3;
  
  return weightedDist + hueBonus + lightnessBonus;
}

function nearestPaletteColor(target, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const candidate = palette[i];
    const dist = colorDistance(target, candidate.rgb);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
    }
  }
  return best;
}

function quantizeToPalette(rawPixels, palette = FINE_PALETTE, options = {}) {
  const safePalette = Array.isArray(palette) && palette.length ? palette : FINE_PALETTE;
  const total = Math.floor((rawPixels && rawPixels.length ? rawPixels.length : 0) / 4);
  const hexGrid = new Array(total);
  const codeGrid = new Array(total);
  const counts = Object.create(null);
  const preserveAlphaColor = clamp(Number(options.preserveAlphaColor) || 0, 0, 0.85);

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

    const alphaRatio = clamp((Number(alpha) || 0) / 255, 0, 1);
    const effectiveAlpha = clamp(alphaRatio + (1 - alphaRatio) * preserveAlphaColor, 0, 1);
    const sourceR = Number(rawPixels[offset]) || 0;
    const sourceG = Number(rawPixels[offset + 1]) || 0;
    const sourceB = Number(rawPixels[offset + 2]) || 0;
    // Composite semi-transparent pixels over white canvas; miniapp editor stage is white-backed.
    const sample = tuneSampleColor({
      r: Math.round(sourceR * effectiveAlpha + 255 * (1 - effectiveAlpha)),
      g: Math.round(sourceG * effectiveAlpha + 255 * (1 - effectiveAlpha)),
      b: Math.round(sourceB * effectiveAlpha + 255 * (1 - effectiveAlpha))
    }, options);
    const nearest = nearestPaletteColor(sample, safePalette);

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
