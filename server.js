const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const { PALETTES } = require("./lib/palettes");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const GRID_SIZES = [52, 104];
const DEFAULT_GRID_SIZE = GRID_SIZES[0];
const FIXED_MAX_COLORS = 12;
const SAMPLE_CELL_SIZE = 12;
const DEFAULT_COLOR_WEIGHT = 1.5;
const DEFAULT_BEADABILITY_WEIGHT = 1.5;
const DEFAULT_CANDIDATE_COUNT = 6;
const SAMPLE_MODES = {
  MODE: "mode",
  AVERAGE: "average"
};
const DEFAULT_SAMPLE_MODE = SAMPLE_MODES.MODE;
const PREPROCESS_MODES = {
  NONE: "none",
  NORMALIZE: "normalize"
};
const DEFAULT_PREPROCESS_MODE = PREPROCESS_MODES.NONE;
const MAPPING_STRATEGIES = {
  DIRECT: "direct",
  CLUSTER_FIRST: "cluster-first"
};
const DEFAULT_MAPPING_STRATEGY = MAPPING_STRATEGIES.DIRECT;

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function distanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

// Convert sRGB (0-255) to CIELAB for perceptual color comparison.
function rgbToLab(color) {
  const toLinear = (value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const f = (value) => {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
  };

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

// CIEDE2000 perceptual color difference (lower is visually closer).
function deltaE2000(lab1, lab2) {
  const degToRad = (deg) => (deg * Math.PI) / 180;
  const radToDeg = (rad) => (rad * 180) / Math.PI;

  const l1 = lab1.l;
  const a1 = lab1.a;
  const b1 = lab1.b;
  const l2 = lab2.l;
  const a2 = lab2.a;
  const b2 = lab2.b;

  const avgLp = (l1 + l2) / 2;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (c1 + c2) / 2;

  const g = 0.5 * (1 - Math.sqrt((avgC ** 7) / (avgC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.sqrt(a1p * a1p + b1 * b1);
  const c2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (c1p + c2p) / 2;

  const h1p = (Math.atan2(b1, a1p) + 2 * Math.PI) % (2 * Math.PI);
  const h2p = (Math.atan2(b2, a2p) + 2 * Math.PI) % (2 * Math.PI);

  const deltaLp = l2 - l1;
  const deltaCp = c2p - c1p;

  let deltahp = 0;
  if (c1p * c2p !== 0) {
    if (Math.abs(h2p - h1p) <= Math.PI) {
      deltahp = h2p - h1p;
    } else if (h2p <= h1p) {
      deltahp = h2p - h1p + 2 * Math.PI;
    } else {
      deltahp = h2p - h1p - 2 * Math.PI;
    }
  }

  const deltaHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(deltahp / 2);

  let avgHp = h1p + h2p;
  if (c1p * c2p === 0) {
    avgHp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= Math.PI) {
    avgHp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 2 * Math.PI) {
    avgHp = (h1p + h2p + 2 * Math.PI) / 2;
  } else {
    avgHp = (h1p + h2p - 2 * Math.PI) / 2;
  }

  const t = 1
    - 0.17 * Math.cos(avgHp - degToRad(30))
    + 0.24 * Math.cos(2 * avgHp)
    + 0.32 * Math.cos(3 * avgHp + degToRad(6))
    - 0.2 * Math.cos(4 * avgHp - degToRad(63));

  const deltaTheta = degToRad(30) * Math.exp(-(((radToDeg(avgHp) - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt((avgCp ** 7) / (avgCp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * ((avgLp - 50) ** 2)) / Math.sqrt(20 + ((avgLp - 50) ** 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(2 * deltaTheta) * rc;

  const kl = 1;
  const kc = 1;
  const kh = 1;

  const vL = deltaLp / (kl * sl);
  const vC = deltaCp / (kc * sc);
  const vH = deltaHp / (kh * sh);

  return Math.sqrt(vL * vL + vC * vC + vH * vH + rt * vC * vH);
}

function pickPalette(paletteId) {
  if (!paletteId || paletteId === "auto") return null;
  return PALETTES.find((palette) => palette.id === paletteId) || null;
}

function normalizePaletteColors(colors) {
  return colors
    .map((entry, index) => {
      if (typeof entry === "string") {
        const hex = entry.toUpperCase();
        return {
          order: index + 1,
          hex,
          rgb: hexToRgb(hex),
          code: null,
          fullCode: null,
          name: null,
          transparent: false
        };
      }

      if (!entry || typeof entry !== "object" || (!entry.hex && !entry.transparent)) {
        return null;
      }

      const hex = entry.hex ? entry.hex.toUpperCase() : null;
      const code = entry.code || (entry.fullCode ? entry.fullCode.replace(/^M/, "") : null);

      return {
        order: Number.isInteger(entry.order) ? entry.order : index + 1,
        hex,
        rgb: entry.rgb || (hex ? hexToRgb(hex) : null),
        code,
        fullCode: entry.fullCode || (code ? `M${code}` : null),
        name: entry.name || code || null,
        transparent: Boolean(entry.transparent || (!entry.rgb && !hex))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function getTextColorForHex(hex) {
  if (!hex) return "#111111";
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 160 ? "#111111" : "#FFFFFF";
}

function sanitizePdfTitle(title) {
  if (!title || typeof title !== "string") return "Bead Pattern";
  return /[^\x00-\x7F]/.test(title) ? "Bead Pattern" : title;
}

function computeAdaptiveLegendColumns({ availableWidth, itemCount, mode }) {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  if (!Number.isFinite(itemCount) || itemCount <= 1) return 1;

  const normalizedMode = mode === "a4" ? "a4" : "ultra";
  const minCardWidth = normalizedMode === "a4" ? 124 : 168;
  const gapX = normalizedMode === "a4" ? 8 : 10;
  const modeMaxColumns = normalizedMode === "a4" ? 4 : 7;

  const maxColumnsByWidth = Math.max(
    1,
    Math.floor((availableWidth + gapX) / (minCardWidth + gapX))
  );
  const maxColumns = Math.max(1, Math.min(modeMaxColumns, maxColumnsByWidth, itemCount));

  let colorDrivenColumns = 2;
  if (itemCount >= 28) colorDrivenColumns = 6;
  else if (itemCount >= 20) colorDrivenColumns = 5;
  else if (itemCount >= 12) colorDrivenColumns = 4;
  else if (itemCount >= 7) colorDrivenColumns = 3;

  return Math.max(1, Math.min(maxColumns, colorDrivenColumns));
}

function isNearWhiteRgb(rgb) {
  if (!rgb) return false;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  const saturation = max === 0 ? 0 : (max - min) / max;
  return brightness >= 185 && saturation <= 0.22;
}

function resolveKeyRgb(key, paletteLookupByKey, cache) {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  let rgb = null;
  if (paletteLookupByKey && paletteLookupByKey.has(key)) {
    const item = paletteLookupByKey.get(key);
    rgb = item && item.rgb ? item.rgb : null;
  }

  if (!rgb && typeof key === "string" && /^#?[0-9a-fA-F]{6}$/.test(key)) {
    rgb = hexToRgb(key.startsWith("#") ? key : `#${key}`);
  }

  cache.set(key, rgb || null);
  return rgb;
}

function removeBorderConnectedWhiteBackground(keyGrid, paletteLookupByKey) {
  if (!Array.isArray(keyGrid) || keyGrid.length === 0 || !Array.isArray(keyGrid[0])) {
    return keyGrid;
  }

  const height = keyGrid.length;
  const width = keyGrid[0].length;
  const rgbCache = new Map();

  const isRemovableWhite = (key) => {
    if (!key) return false;
    if (paletteLookupByKey && paletteLookupByKey.has(key)) {
      const item = paletteLookupByKey.get(key);
      if (item && item.transparent) return true;
    }
    const rgb = resolveKeyRgb(key, paletteLookupByKey, rgbCache);
    return isNearWhiteRgb(rgb);
  };

  const isBackgroundPassable = (key) => !key || isRemovableWhite(key);

  const result = keyGrid.map((row) => row.slice());
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [];

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (visited[y][x]) return;
    const key = result[y][x];
    if (!isBackgroundPassable(key)) return;
    visited[y][x] = true;
    queue.push([x, y]);
  };

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  if (!queue.length) return keyGrid;

  while (queue.length) {
    const [x, y] = queue.shift();
    if (isRemovableWhite(result[y][x])) {
      result[y][x] = null;
    }
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  return result;
}

function mostCommonColor(colors) {
  const counts = new Map();
  for (const color of colors) {
    if (!color) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  let winner = null;
  let max = 0;
  for (const [color, count] of counts.entries()) {
    if (count > max) {
      max = count;
      winner = color;
    }
  }
  return winner;
}

function optimizeGrid(grid, passes = 1) {
  let current = grid.map((row) => row.slice());
  const height = current.length;
  const width = current[0].length;

  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  const neighbors4 = [
    [0, -1], [-1, 0], [1, 0], [0, 1]
  ];

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((row) => row.slice());
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color = current[y][x];

        const neighborColors = [];
        let same4 = 0;
        let same8 = 0;

        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = current[ny][nx];
          neighborColors.push(neighbor);
          if (neighbor === color) same8 += 1;
        }

        for (const [dx, dy] of neighbors4) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = current[ny][nx];
          if (neighbor === color) same4 += 1;
        }

        const dominant = mostCommonColor(neighborColors);

        if (same8 === 0 && dominant && dominant !== color) {
          next[y][x] = dominant;
          continue;
        }

        if (same4 <= 1 && same8 <= 2 && dominant && dominant !== color) {
          next[y][x] = dominant;
        }
      }
    }
    current = next;
  }

  return current;
}

function countColors(grid) {
  const counts = new Map();
  for (const row of grid) {
    for (const color of row) {
      if (!color) continue;
      counts.set(color, (counts.get(color) || 0) + 1);
    }
  }
  return counts;
}

function buildLegend(grid, paletteOrder, paletteLookup) {
  const counts = countColors(grid);
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0) || 1;
  const colors = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));

  return colors.map((color, index) => {
    const meta = paletteLookup ? paletteLookup.get(color) : null;
    return {
      index: index + 1,
      color,
      hex: color,
      code: meta && meta.code ? meta.code : null,
      fullCode: meta && meta.fullCode ? meta.fullCode : null,
      name: meta && meta.name ? meta.name : null,
      count: counts.get(color),
      percent: Math.round((counts.get(color) / total) * 1000) / 10
    };
  });
}

function kMeans(colors, k, iterations = 8) {
  const centers = [];
  const used = new Set();
  while (centers.length < k && centers.length < colors.length) {
    const idx = Math.floor(Math.random() * colors.length);
    if (used.has(idx)) continue;
    used.add(idx);
    centers.push({ ...colors[idx] });
  }

  const assignments = new Array(colors.length).fill(0);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < colors.length; i += 1) {
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const dist = distanceSq(colors[i], centers[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = c;
        }
      }
      assignments[i] = bestIndex;
    }

    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let i = 0; i < colors.length; i += 1) {
      const cluster = assignments[i];
      const color = colors[i];
      sums[cluster].r += color.r;
      sums[cluster].g += color.g;
      sums[cluster].b += color.b;
      sums[cluster].count += 1;
    }

    for (let c = 0; c < centers.length; c += 1) {
      if (sums[c].count === 0) {
        const fallback = colors[Math.floor(Math.random() * colors.length)];
        centers[c] = { ...fallback };
      } else {
        centers[c] = {
          r: sums[c].r / sums[c].count,
          g: sums[c].g / sums[c].count,
          b: sums[c].b / sums[c].count
        };
      }
    }
  }

  return { centers, assignments };
}

function labDistanceSq(a, b) {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dl * dl + da * da + db * db;
}

// Deterministic LAB-space k-means used by "cluster-first" mapping.
function kMeansLab(points, k, iterations = 10) {
  if (!points.length) return { centers: [], assignments: [] };
  const uniqueTarget = Math.min(k, points.length);

  const centers = [{ ...points[0].lab }];
  while (centers.length < uniqueTarget) {
    let bestPoint = points[0];
    let bestDist = -1;

    for (const point of points) {
      let nearest = Infinity;
      for (const center of centers) {
        const dist = labDistanceSq(point.lab, center);
        if (dist < nearest) nearest = dist;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        bestPoint = point;
      }
    }

    centers.push({ ...bestPoint.lab });
  }

  const assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < points.length; i += 1) {
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const dist = labDistanceSq(points[i].lab, centers[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = c;
        }
      }
      assignments[i] = bestIndex;
    }

    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, count: 0 }));
    for (let i = 0; i < points.length; i += 1) {
      const cluster = assignments[i];
      const lab = points[i].lab;
      sums[cluster].l += lab.l;
      sums[cluster].a += lab.a;
      sums[cluster].b += lab.b;
      sums[cluster].count += 1;
    }

    for (let c = 0; c < centers.length; c += 1) {
      if (!sums[c].count) continue;
      centers[c] = {
        l: sums[c].l / sums[c].count,
        a: sums[c].a / sums[c].count,
        b: sums[c].b / sums[c].count
      };
    }
  }

  return { centers, assignments };
}

function getPaletteItemKey(item) {
  return item.fullCode || item.code || item.hex || `ORDER_${item.order}`;
}

function toDisplayHex(item) {
  if (!item || !item.hex) return "#FFFFFF";
  return item.hex;
}

function nearestPaletteColor(color, palette) {
  let best = palette[0];
  let bestDist = Infinity;
  for (const candidate of palette) {
    const dist = distanceSq(color, candidate.rgb);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

async function buildSamplingBuffer(buffer, { gridSize, maxEdgeSize, samplingMode, preprocessMode }) {
  const samplingSize = gridSize * SAMPLE_CELL_SIZE;
  const scaledEdge = clampNumber(
    Math.round((maxEdgeSize / gridSize) * samplingSize),
    1,
    samplingSize,
    samplingSize
  );

  let pipeline = sharp(buffer).rotate().ensureAlpha();
  if (preprocessMode === PREPROCESS_MODES.NORMALIZE) {
    pipeline = pipeline.normalise();
  }
  const resizeKernel = samplingMode === SAMPLE_MODES.MODE
    ? sharp.kernel.nearest
    : sharp.kernel.lanczos3;

  const resizedImage = await pipeline
    .resize(scaledEdge, scaledEdge, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: resizeKernel
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: samplingSize,
      height: samplingSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resizedImage, gravity: "center" }])
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function sampleRepresentativeColors(raw, gridSize, samplingMode) {
  const width = raw.info.width;
  const cellSize = Math.floor(width / gridSize);
  const reps = [];

  for (let y = 0; y < gridSize; y += 1) {
    const yStart = y * cellSize;
    const yEnd = yStart + cellSize;
    for (let x = 0; x < gridSize; x += 1) {
      const xStart = x * cellSize;
      const xEnd = xStart + cellSize;

      let count = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      const colorCounts = new Map();

      for (let py = yStart; py < yEnd; py += 1) {
        for (let px = xStart; px < xEnd; px += 1) {
          const idx = (py * width + px) * 4;
          const alpha = raw.data[idx + 3];
          if (alpha === 0) continue;

          const r = raw.data[idx];
          const g = raw.data[idx + 1];
          const b = raw.data[idx + 2];
          count += 1;

          if (samplingMode === SAMPLE_MODES.MODE) {
            const key = (r << 16) | (g << 8) | b;
            colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
          } else {
            sumR += r;
            sumG += g;
            sumB += b;
          }
        }
      }

      if (count === 0) {
        reps.push(null);
        continue;
      }

      if (samplingMode === SAMPLE_MODES.MODE) {
        let bestKey = null;
        let bestCount = -1;
        for (const [key, colorCount] of colorCounts.entries()) {
          if (colorCount > bestCount) {
            bestCount = colorCount;
            bestKey = key;
          }
        }
        reps.push({
          r: (bestKey >> 16) & 255,
          g: (bestKey >> 8) & 255,
          b: bestKey & 255
        });
      } else {
        reps.push({
          r: sumR / count,
          g: sumG / count,
          b: sumB / count
        });
      }
    }
  }

  return reps;
}

function enrichPaletteWithLab(paletteColors) {
  return paletteColors.map((item) => ({
    ...item,
    lab: item.rgb ? rgbToLab(item.rgb) : null
  }));
}

function buildPerceptualCandidates(representativeColors, paletteColorsWithLab, candidateCount) {
  const opaquePalette = paletteColorsWithLab.filter((item) => item.lab && !item.transparent);
  const deltaCache = new Map();

  return representativeColors.map((color) => {
    if (!color) {
      return {
        fixed: true,
        empty: true,
        candidates: []
      };
    }

    const rounded = {
      r: Math.round(color.r),
      g: Math.round(color.g),
      b: Math.round(color.b)
    };
    const cacheKey = `${rounded.r},${rounded.g},${rounded.b}`;
    let deltas = deltaCache.get(cacheKey);
    if (!deltas) {
      const lab = rgbToLab(rounded);
      deltas = opaquePalette
        .map((item) => ({
          key: getPaletteItemKey(item),
          deltaE: deltaE2000(lab, item.lab)
        }))
        .sort((a, b) => a.deltaE - b.deltaE);
      deltaCache.set(cacheKey, deltas);
    }

    return {
      fixed: false,
      candidates: deltas.slice(0, candidateCount)
    };
  });
}

function buildClusterFirstKeyGrid(representativeColors, paletteColorsWithLab, clusterCount, gridSize) {
  const opaquePalette = paletteColorsWithLab.filter((item) => item.lab && !item.transparent);
  if (!opaquePalette.length) {
    const fallbackGrid = [];
    for (let y = 0; y < gridSize; y += 1) {
      fallbackGrid.push(Array(gridSize).fill(null));
    }
    return fallbackGrid;
  }

  const points = [];
  for (const color of representativeColors) {
    if (!color) continue;
    const rounded = {
      r: Math.round(color.r),
      g: Math.round(color.g),
      b: Math.round(color.b)
    };
    points.push({ lab: rgbToLab(rounded) });
  }

  const safeClusterCount = clampNumber(
    clusterCount,
    2,
    Math.min(32, opaquePalette.length),
    Math.min(12, opaquePalette.length)
  );

  const { centers, assignments } = points.length
    ? kMeansLab(points, safeClusterCount, 12)
    : { centers: [], assignments: [] };

  const centerMappedKey = centers.map((centerLab) => {
    let best = opaquePalette[0];
    let bestDelta = Infinity;
    for (const item of opaquePalette) {
      const delta = deltaE2000(centerLab, item.lab);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = item;
      }
    }
    return getPaletteItemKey(best);
  });

  const mappedKeys = [];
  const fallbackKey = getPaletteItemKey(opaquePalette[0]);
  let pointCursor = 0;
  for (const color of representativeColors) {
    if (!color) {
      mappedKeys.push(null);
      continue;
    }
    const clusterIndex = assignments[pointCursor++] || 0;
    mappedKeys.push(centerMappedKey[clusterIndex] || centerMappedKey[0] || fallbackKey);
  }

  const keyGrid = [];
  for (let y = 0; y < gridSize; y += 1) {
    keyGrid.push(mappedKeys.slice(y * gridSize, (y + 1) * gridSize));
  }

  return keyGrid;
}

// Penalize isolated islands, thin lines and noisy boundaries.
function beadabilityPenalty(keyGrid, x, y, candidateKey) {
  const height = keyGrid.length;
  const width = keyGrid[0].length;
  const dirs4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const dirs8 = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  let neighbors4 = 0;
  let same4 = 0;
  let neighbors8 = 0;
  let same8 = 0;
  let diff4 = 0;

  for (const [dx, dy] of dirs4) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    neighbors4 += 1;
    if (keyGrid[ny][nx] === candidateKey) same4 += 1;
    else diff4 += 1;
  }

  for (const [dx, dy] of dirs8) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    neighbors8 += 1;
    if (keyGrid[ny][nx] === candidateKey) same8 += 1;
  }

  let penalty = 0;
  if (neighbors4 > 0) {
    if (same4 === 0) penalty += 8;
    else if (same4 === 1) penalty += 3.5;
    else if (same4 === 2) penalty += 1.2;
  }

  if (neighbors8 > 0 && same8 <= 1) penalty += 2.2;
  penalty += diff4 * 0.55;

  const left = x > 0 && keyGrid[y][x - 1] === candidateKey;
  const right = x + 1 < width && keyGrid[y][x + 1] === candidateKey;
  const up = y > 0 && keyGrid[y - 1][x] === candidateKey;
  const down = y + 1 < height && keyGrid[y + 1][x] === candidateKey;
  const horizontalOnly = (left || right) && !up && !down;
  const verticalOnly = (up || down) && !left && !right;
  if (horizontalOnly || verticalOnly) penalty += 1.8;

  return penalty;
}

function getLabHue(lab) {
  if (!lab) return null;
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  if (chroma < 6) return null;
  const angle = Math.atan2(lab.b, lab.a);
  const degrees = (angle * 180) / Math.PI;
  return (degrees + 360) % 360;
}

function hueDeltaDegrees(h1, h2) {
  if (h1 == null || h2 == null) return 0;
  const raw = Math.abs(h1 - h2) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function optimizeByPerceptualLoss(initialKeyGrid, cellCandidates, options) {
  let current = initialKeyGrid.map((row) => row.slice());
  const gridSize = current.length;
  const alpha = Number.isFinite(options.alpha) ? options.alpha : DEFAULT_COLOR_WEIGHT;
  const beta = Number.isFinite(options.beta) ? options.beta : DEFAULT_BEADABILITY_WEIGHT;
  const passes = Math.max(1, options.passes || 1);
  const hueGuard = options.hueGuard !== false;
  const maxHueShift = Number.isFinite(options.maxHueShift) ? options.maxHueShift : 52;
  const paletteLookupByKey = options.paletteLookupByKey || null;
  const baseHueCache = new Map();

  const getHue = (key) => {
    if (!paletteLookupByKey || !key) return null;
    if (baseHueCache.has(key)) return baseHueCache.get(key);
    const item = paletteLookupByKey.get(key);
    const hue = item && item.lab ? getLabHue(item.lab) : null;
    baseHueCache.set(key, hue);
    return hue;
  };

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((row) => row.slice());
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const cell = cellCandidates[y * gridSize + x];
        if (!cell || cell.fixed || !cell.candidates.length) continue;
        const baseKey = initialKeyGrid[y][x];
        const baseHue = getHue(baseKey);

        let bestKey = next[y][x];
        let bestLoss = Infinity;
        for (const candidate of cell.candidates) {
          const colorTerm = alpha * candidate.deltaE;
          const beadabilityTerm = beta * beadabilityPenalty(current, x, y, candidate.key);
          let huePenalty = 0;
          if (hueGuard) {
            const candidateHue = getHue(candidate.key);
            const hueShift = hueDeltaDegrees(baseHue, candidateHue);
            if (hueShift > maxHueShift) {
              huePenalty = (hueShift - maxHueShift) * 0.32 + 5;
            }
          }
          const loss = colorTerm + beadabilityTerm + huePenalty;
          if (loss < bestLoss) {
            bestLoss = loss;
            bestKey = candidate.key;
          }
        }
        next[y][x] = bestKey;
      }
    }
    current = next;
  }

  return current;
}

function buildLegendFromKeyGrid(keyGrid, paletteOrderKeys, paletteLookupByKey) {
  const counts = new Map();
  for (const row of keyGrid) {
    for (const key of row) {
      if (!key) continue;
      if (paletteLookupByKey && paletteLookupByKey.has(key)) {
        const item = paletteLookupByKey.get(key);
        if (item && item.transparent) continue;
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0) || 1;
  const keys = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));

  return keys.map((key, index) => {
    const item = paletteLookupByKey.get(key) || null;
    const swatchHex = toDisplayHex(item);
    return {
      index: index + 1,
      color: swatchHex,
      hex: swatchHex,
      code: item && item.code ? item.code : null,
      fullCode: item && item.fullCode ? item.fullCode : null,
      name: item ? (item.name || item.code || null) : null,
      count: counts.get(key),
      percent: Math.round((counts.get(key) / total) * 1000) / 10
    };
  });
}

async function generateGridFromImage(buffer, options) {
  const gridSize = options.gridSize;
  const maxEdgeSize = clampNumber(options.maxEdgeSize, 1, gridSize, gridSize);
  const samplingMode = options.samplingMode === SAMPLE_MODES.AVERAGE
    ? SAMPLE_MODES.AVERAGE
    : SAMPLE_MODES.MODE;
  const preprocessMode = options.preprocessMode === PREPROCESS_MODES.NORMALIZE
    ? PREPROCESS_MODES.NORMALIZE
    : PREPROCESS_MODES.NONE;
  const mappingStrategy = options.mappingStrategy === MAPPING_STRATEGIES.CLUSTER_FIRST
    ? MAPPING_STRATEGIES.CLUSTER_FIRST
    : MAPPING_STRATEGIES.DIRECT;

  const samplingRaw = await buildSamplingBuffer(buffer, {
    gridSize,
    maxEdgeSize,
    samplingMode,
    preprocessMode
  });
  const representativeColors = sampleRepresentativeColors(samplingRaw, gridSize, samplingMode);

  if (!options.palette) {
    const validReps = representativeColors.filter(Boolean);
    const k = Math.max(2, Math.min(options.maxColors || FIXED_MAX_COLORS, 32));
    const { centers, assignments } = validReps.length > 0 ? kMeans(validReps, k, 8) : { centers: [], assignments: [] };

    let assignCursor = 0;
    const mappedHex = representativeColors.map((rep) => {
      if (!rep) return "#FFFFFF";
      const center = centers[assignments[assignCursor++]];
      return rgbToHex(center.r, center.g, center.b);
    });

    const keyGrid = [];
    for (let y = 0; y < gridSize; y += 1) {
      keyGrid.push(mappedHex.slice(y * gridSize, (y + 1) * gridSize));
    }

    const optimizedKeyGrid = options.optimize ? optimizeGrid(keyGrid, options.optimizePasses) : keyGrid;
    const cleanedKeyGrid = removeBorderConnectedWhiteBackground(optimizedKeyGrid, null);
    const lookup = new Map();
    for (const row of cleanedKeyGrid) {
      for (const hex of row) {
        if (!hex) continue;
        if (!lookup.has(hex)) {
          lookup.set(hex, {
            order: lookup.size + 1,
            hex,
            rgb: hexToRgb(hex),
            code: null,
            fullCode: null,
            name: null,
            transparent: false
          });
        }
      }
    }
    const legend = buildLegendFromKeyGrid(cleanedKeyGrid, null, lookup);

    return {
      grid: cleanedKeyGrid,
      legend,
      codeByHex: null,
      codeGrid: null
    };
  }

  const paletteColors = enrichPaletteWithLab(normalizePaletteColors(options.palette.colors));
  const paletteOrderKeys = paletteColors.map((item) => getPaletteItemKey(item));
  const paletteLookupByKey = new Map(paletteColors.map((item) => [getPaletteItemKey(item), item]));
  const firstOpaqueItem = paletteColors.find((item) => !item.transparent) || null;
  const firstOpaqueKey = firstOpaqueItem ? getPaletteItemKey(firstOpaqueItem) : (paletteOrderKeys[0] || null);

  // Build top-k perceptual candidates per cell using LAB + DeltaE2000.
  const cellCandidates = buildPerceptualCandidates(
    representativeColors,
    paletteColors,
    DEFAULT_CANDIDATE_COUNT
  );

  const keyGrid = mappingStrategy === MAPPING_STRATEGIES.CLUSTER_FIRST
    ? buildClusterFirstKeyGrid(
      representativeColors,
      paletteColors,
      options.clusterCount || options.maxColors || FIXED_MAX_COLORS,
      gridSize
    )
    : (() => {
      const directGrid = [];
      for (let y = 0; y < gridSize; y += 1) {
        const row = [];
        for (let x = 0; x < gridSize; x += 1) {
          const cell = cellCandidates[y * gridSize + x];
          if (cell && cell.empty) {
            row.push(null);
            continue;
          }
          const fallbackKey = firstOpaqueKey;
          row.push(cell && cell.candidates[0] ? cell.candidates[0].key : fallbackKey);
        }
        directGrid.push(row);
      }
      return directGrid;
    })();

  const optimizedKeyGrid = options.optimize
    ? optimizeByPerceptualLoss(keyGrid, cellCandidates, {
      alpha: options.alpha,
      beta: options.beta,
      passes: options.optimizePasses,
      paletteLookupByKey,
      hueGuard: true,
      maxHueShift: 52
    })
    : keyGrid;
  const cleanedKeyGrid = removeBorderConnectedWhiteBackground(optimizedKeyGrid, paletteLookupByKey);
  const fallbackItem = firstOpaqueItem || paletteColors[0] || null;
  const itemGrid = cleanedKeyGrid.map((row) => row.map((key) => (
    key
      ? (() => {
        const item = paletteLookupByKey.get(key) || fallbackItem;
        return item && item.transparent ? null : item;
      })()
      : null
  )));

  return {
    grid: itemGrid.map((row) => row.map((item) => (item ? toDisplayHex(item) : null))),
    legend: buildLegendFromKeyGrid(cleanedKeyGrid, paletteOrderKeys, paletteLookupByKey),
    codeByHex: null,
    codeGrid: itemGrid.map((row) => row.map((item) => (item && item.code ? item.code : null)))
  };
}

function renderPdfFromGrid({ grid, legend, title, codeGrid, mode = "ultra" }) {
  const gridSize = grid.length;
  const normalizedMode = mode === "a4" ? "a4" : "ultra";
  const margin = normalizedMode === "a4" ? 36 : 42;
  const titleGap = 34;
  const safeTitle = sanitizePdfTitle(title || "Bead Pattern");

  const safeLegend = Array.isArray(legend) ? [...legend].sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
  const legendCount = safeLegend.length;
  const legendGapX = normalizedMode === "a4" ? 8 : 10;
  const legendCardHeight = normalizedMode === "a4" ? 34 : 36;
  const legendRowHeight = legendCardHeight + (normalizedMode === "a4" ? 8 : 9);
  const legendHeaderGap = normalizedMode === "a4" ? 46 : 52;
  const legendCodeFontSize = normalizedMode === "a4" ? 12 : 13;
  const legendMetaFontSize = normalizedMode === "a4" ? 10 : 11;
  const legendSwatchSize = normalizedMode === "a4" ? 12 : 13;

  let doc;
  let pageWidth;
  let pageHeight;
  let availableWidth;
  let cellSize;
  let coordBand;
  let columns;
  let rowHeight = legendRowHeight;
  let cardHeight = legendCardHeight;
  let legendAreaHeight;

  if (normalizedMode === "a4") {
    doc = new PDFDocument({
      size: "A4",
      margin
    });
    pageWidth = doc.page.width;
    pageHeight = doc.page.height;
    availableWidth = pageWidth - margin * 2;

    columns = computeAdaptiveLegendColumns({
      availableWidth,
      itemCount: legendCount,
      mode: normalizedMode
    });
    coordBand = 10;

    const legendRows = Math.max(1, Math.ceil(Math.max(1, legendCount) / columns));
    legendAreaHeight = legendHeaderGap + legendRows * rowHeight;
    const usableHeight = pageHeight - margin * 2 - titleGap - legendAreaHeight - coordBand * 2 - 20;
    const usableWidth = availableWidth - coordBand * 2;
    cellSize = Math.max(5, Math.floor(Math.min(usableWidth, usableHeight) / gridSize));
  } else {
    if (gridSize >= 100) {
      cellSize = 18;
    } else if (gridSize >= 80) {
      cellSize = 20;
    } else {
      cellSize = 24;
    }

    coordBand = Math.max(12, Math.floor(cellSize * 0.62));
    const gridBlock = cellSize * gridSize + coordBand * 2;

    pageWidth = Math.max(1300, gridBlock + margin * 2);
    availableWidth = pageWidth - margin * 2;
    columns = computeAdaptiveLegendColumns({
      availableWidth,
      itemCount: legendCount,
      mode: normalizedMode
    });
    const legendRows = Math.max(1, Math.ceil(Math.max(1, legendCount) / columns));
    legendAreaHeight = legendHeaderGap + legendRows * rowHeight;
    pageHeight = Math.max(1000, margin + titleGap + gridBlock + 24 + legendAreaHeight + margin);

    doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margin
    });
  }

  const gridWidth = cellSize * gridSize;
  const gridHeight = gridWidth;
  const startX = margin + (availableWidth - (gridWidth + coordBand * 2)) / 2 + coordBand;
  const startY = margin + titleGap + coordBand;

  doc.fontSize(16).fillColor("#111111").text(safeTitle, margin, margin);

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const hex = grid[y][x];
      if (hex) {
        doc
          .rect(startX + x * cellSize, startY + y * cellSize, cellSize, cellSize)
          .fill(hex);
      }
    }
  }

  const tintAlpha = normalizedMode === "a4" ? 0.12 : 0.18;
  doc.save();
  doc.fillOpacity(tintAlpha).fillColor("#FFFFFF");
  doc.rect(startX, startY, gridWidth, gridHeight).fill();
  doc.restore();

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const hex = grid[y][x];
      const cellCode = codeGrid && codeGrid[y] ? codeGrid[y][x] : null;
      if (cellCode && hex) {
        const maxCodeSize = normalizedMode === "a4" ? 10 : 13;
        const fontSize = Math.max(5, Math.min(maxCodeSize, Math.floor(cellSize * 0.44)));
        const textY = startY + y * cellSize + (cellSize - fontSize) / 2 - 0.5;
        doc
          .fontSize(fontSize)
          .fillColor(getTextColorForHex(hex))
          .text(cellCode, startX + x * cellSize, textY, {
            width: cellSize,
            align: "center",
            lineBreak: false
          });
      }
    }
  }

  const thinLineWidth = Math.max(0.35, Math.min(1.2, cellSize * 0.05));
  doc.lineWidth(thinLineWidth).strokeColor("#222222");
  for (let i = 0; i <= gridSize; i += 1) {
    const x = startX + i * cellSize;
    doc.moveTo(x, startY).lineTo(x, startY + gridHeight).stroke();
    const y = startY + i * cellSize;
    doc.moveTo(startX, y).lineTo(startX + gridWidth, y).stroke();
  }

  const thickLineWidth = Math.max(1, Math.min(2.4, cellSize * 0.14));
  doc.lineWidth(thickLineWidth).strokeColor("#111111");
  for (let i = 0; i <= gridSize; i += 5) {
    const x = startX + i * cellSize;
    doc.moveTo(x, startY).lineTo(x, startY + gridHeight).stroke();
    const y = startY + i * cellSize;
    doc.moveTo(startX, y).lineTo(startX + gridWidth, y).stroke();
  }

  const coordFontSize = Math.max(6, Math.min(8, Math.floor(cellSize * 0.42)));
  const topY = startY - coordBand + (coordBand - coordFontSize) / 2;
  const bottomY = startY + gridHeight + (coordBand - coordFontSize) / 2;
  doc.fontSize(coordFontSize).fillColor("#111111");
  for (let i = 1; i <= gridSize; i += 1) {
    const centerX = startX + (i - 1) * cellSize;
    const centerY = startY + (i - 1) * cellSize + (cellSize - coordFontSize) / 2 - 0.5;
    const label = String(i);
    doc.text(label, centerX, topY, { width: cellSize, align: "center", lineBreak: false });
    doc.text(label, centerX, bottomY, { width: cellSize, align: "center", lineBreak: false });
    doc.text(label, startX - coordBand + 1, centerY, { width: coordBand - 2, align: "center", lineBreak: false });
    doc.text(label, startX + gridWidth + 1, centerY, { width: coordBand - 2, align: "center", lineBreak: false });
  }

  const legendStartY = startY + gridHeight + 24;
  doc.fontSize(11).fillColor("#111111");
  doc.text("Legend", margin, legendStartY - 10);

  const safeColumns = Math.max(1, columns);
  const colWidth = Math.floor((availableWidth - legendGapX * (safeColumns - 1)) / safeColumns);
  safeLegend.forEach((item, idx) => {
    const col = idx % safeColumns;
    const row = Math.floor(idx / safeColumns);
    const cardX = margin + col * (colWidth + legendGapX);
    const cardY = legendStartY + row * rowHeight;
    const cardWidth = colWidth;

    doc.save();
    doc.lineWidth(0.7).strokeColor("#d7c8ad").fillColor("#fffaf1");
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 6).fillAndStroke();
    doc.restore();

    const swatchHex = item.hex || item.color || "#000000";
    const code = item.code || `#${item.index}`;
    const swatchY = cardY + Math.floor((cardHeight - legendSwatchSize) / 2);
    doc.rect(cardX + 10, swatchY, legendSwatchSize, legendSwatchSize).fill(swatchHex);
    doc.fontSize(legendCodeFontSize).fillColor("#1f1f1f").text(code, cardX + 29, cardY + 5, {
      width: cardWidth - 35,
      lineBreak: false
    });
    doc.fontSize(legendMetaFontSize).fillColor("#4d4d4d").text(`${item.count} 颗 (${item.percent}%)`, cardX + 29, cardY + 19, {
      width: cardWidth - 35,
      lineBreak: false
    });
  });

  return doc;
}

function countNonEmptyGridCells(grid) {
  if (!Array.isArray(grid)) return 0;
  let count = 0;
  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell) count += 1;
    }
  }
  return count;
}

function createPdfBufferFromGrid({ grid, legend, title, codeGrid, mode = "ultra" }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = renderPdfFromGrid({ grid, legend, title, codeGrid, mode });
      const chunks = [];

      doc.on("data", (chunk) => {
        chunks.push(chunk);
      });
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", (error) => {
        reject(error);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function sendPdfDownload(res, { grid, legend, title, codeGrid, mode, filename, logTag }) {
  const normalizedMode = mode === "a4" ? "a4" : "ultra";
  const safeFilename = filename || "bead-pattern.pdf";
  const pdfBuffer = await createPdfBufferFromGrid({
    grid,
    legend,
    title,
    codeGrid,
    mode: normalizedMode
  });

  const usedCells = countNonEmptyGridCells(grid);
  const legendCount = Array.isArray(legend) ? legend.length : 0;
  console.log(
    `[${logTag || "pdf-export"}] mode=${normalizedMode} grid=${grid.length} used=${usedCells} legend=${legendCount} bytes=${pdfBuffer.length}`
  );

  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  res.setHeader("Content-Length", String(pdfBuffer.length));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(pdfBuffer);
}

app.get("/api/palettes", (req, res) => {
  res.json({
    palettes: PALETTES
  });
});

app.post("/api/export-pdf", async (req, res) => {
  try {
    const { grid, legend, codeGrid, title, pdfMode } = req.body || {};
    if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) {
      return res.status(400).json({ error: "缺少有效网格数据。" });
    }

    const safeLegend = Array.isArray(legend) ? legend : buildLegend(grid);
    await sendPdfDownload(res, {
      grid,
      legend: safeLegend,
      title: title || "Bead Pattern",
      codeGrid: codeGrid || null,
      mode: pdfMode === "a4" ? "a4" : "ultra",
      filename: "bead-pattern-ultra.pdf",
      logTag: "export-pdf"
    });
  } catch (error) {
    console.error("[export-pdf] 导出失败:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "高清 PDF 导出失败。" });
    }
    res.end();
  }
});

app.post("/api/generate", upload.single("image"), async (req, res) => {
  try {
    const output = req.query.format || req.body.output || "json";

    if (req.is("application/json") && req.body.grid) {
      if (output !== "pdf") {
        return res.status(400).json({ error: "网格数据模式仅支持导出 PDF。" });
      }

      const grid = req.body.grid;
      const legend = req.body.legend || buildLegend(grid);
      const title = req.body.title || "Bead Pattern";
      const codeGrid = req.body.codeGrid || null;
      const pdfMode = req.body.pdfMode === "a4" ? "a4" : "ultra";
      await sendPdfDownload(res, {
        grid,
        legend,
        title,
        codeGrid,
        mode: pdfMode,
        filename: "bead-pattern.pdf",
        logTag: "generate-grid-pdf"
      });
      return;
    }

    if (!req.file) {
      return res.status(400).json({ error: "缺少图片文件。" });
    }

    const requestedGridSize = Number.parseInt(req.body.gridSize, 10);
    const safeGridSize = GRID_SIZES.includes(requestedGridSize)
      ? requestedGridSize
      : DEFAULT_GRID_SIZE;
    const maxEdgeSize = clampNumber(req.body.maxEdgeSize, 1, safeGridSize, safeGridSize);
    const maxColors = FIXED_MAX_COLORS;
    const paletteId = req.body.paletteId;
    const samplingMode = req.body.samplingMode === SAMPLE_MODES.AVERAGE
      ? SAMPLE_MODES.AVERAGE
      : DEFAULT_SAMPLE_MODE;
    const preprocessMode = PREPROCESS_MODES.NONE;
    const mappingStrategy = MAPPING_STRATEGIES.DIRECT;
    const alpha = DEFAULT_COLOR_WEIGHT;
    const beta = DEFAULT_BEADABILITY_WEIGHT;
    const optimize = req.body.optimize !== "false";
    const optimizePasses = clampNumber(req.body.optimizePasses, 1, 3, 1);

    const palette = pickPalette(paletteId);

    const result = await generateGridFromImage(req.file.buffer, {
      gridSize: safeGridSize,
      maxEdgeSize,
      maxColors,
      palette,
      samplingMode,
      preprocessMode,
      mappingStrategy,
      clusterCount: maxColors,
      alpha,
      beta,
      optimize,
      optimizePasses
    });

    if (output === "pdf") {
      const pdfMode = req.body.pdfMode === "a4" ? "a4" : "ultra";
      await sendPdfDownload(res, {
        grid: result.grid,
        legend: result.legend,
        title: "Bead Pattern",
        codeGrid: result.codeGrid,
        mode: pdfMode,
        filename: "bead-pattern.pdf",
        logTag: "generate-image-pdf"
      });
      return;
    }

    res.json({
      gridSize: safeGridSize,
      legend: result.legend,
      grid: result.grid,
      codeByHex: result.codeByHex,
      codeGrid: result.codeGrid,
      gridCodes: result.codeGrid,
      samplingMode,
      preprocessMode,
      mappingStrategy,
      alpha,
      beta
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "生成图纸失败。" });
  }
});

const port = 3000;
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error("端口 3000 已被占用。");
    console.error("可执行: lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill");
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
