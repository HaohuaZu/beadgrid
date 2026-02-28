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
const DEFAULT_SIMILARITY_MERGE_DELTA_E = 10.2;
const DEFAULT_REGION_MERGE_DELTA_E = 7.8;
const DEFAULT_REGION_MIN_SIZE = 5;
const DEFAULT_REGION_MAJORITY_RATIO = 0.62;
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

function colorDistance(a, b) {
  return Math.sqrt(distanceSq(a, b));
}

function mergeSimilarPaletteKeysByFrequency(keyGrid, paletteLookupByKey, similarityThreshold = 30) {
  if (!Array.isArray(keyGrid) || !keyGrid.length || !Array.isArray(keyGrid[0])) {
    return keyGrid;
  }

  const counts = new Map();
  for (const row of keyGrid) {
    for (const key of row) {
      if (!key) continue;
      const color = paletteLookupByKey.get(key);
      if (color && color.transparent) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const keysByFrequency = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map((entry) => entry[0]);
  if (keysByFrequency.length <= 1) {
    return keyGrid;
  }

  const replaced = new Set();
  const replacementMap = new Map();
  const threshold = Math.max(0, Number(similarityThreshold) || 0);

  for (let i = 0; i < keysByFrequency.length; i += 1) {
    const currentKey = keysByFrequency[i];
    if (replaced.has(currentKey)) continue;
    const currentItem = paletteLookupByKey.get(currentKey);
    if (!currentItem || !currentItem.rgb || currentItem.transparent) continue;

    for (let j = i + 1; j < keysByFrequency.length; j += 1) {
      const lowerKey = keysByFrequency[j];
      if (replaced.has(lowerKey)) continue;
      const lowerItem = paletteLookupByKey.get(lowerKey);
      if (!lowerItem || !lowerItem.rgb || lowerItem.transparent) continue;
      const distance = colorDistance(currentItem.rgb, lowerItem.rgb);
      if (distance < threshold) {
        replaced.add(lowerKey);
        replacementMap.set(lowerKey, currentKey);
      }
    }
  }

  if (!replacementMap.size) return keyGrid;
  return keyGrid.map((row) => row.map((key) => (key && replacementMap.has(key) ? replacementMap.get(key) : key)));
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

function resolveKeyLab(key, paletteLookupByKey, rgbCache, labCache) {
  if (!key) return null;
  if (labCache.has(key)) return labCache.get(key);
  const rgb = resolveKeyRgb(key, paletteLookupByKey, rgbCache);
  const lab = rgb ? rgbToLab(rgb) : null;
  labCache.set(key, lab || null);
  return lab;
}

function isWarmHue(hue) {
  if (!Number.isFinite(hue)) return false;
  return hue <= 55 || hue >= 330;
}

function createKeyProfileResolver(paletteLookupByKey) {
  const rgbCache = new Map();
  const labCache = new Map();
  const profileCache = new Map();
  return (key) => {
    if (!key) return null;
    if (profileCache.has(key)) return profileCache.get(key);
    const lab = resolveKeyLab(key, paletteLookupByKey, rgbCache, labCache);
    if (!lab) {
      profileCache.set(key, null);
      return null;
    }
    const hue = getLabHue(lab);
    const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    const profile = {
      l: lab.l,
      hue,
      chroma
    };
    profileCache.set(key, profile);
    return profile;
  };
}

function createKeyDeltaResolver(paletteLookupByKey) {
  const rgbCache = new Map();
  const labCache = new Map();
  const deltaCache = new Map();
  return (leftKey, rightKey) => {
    if (!leftKey || !rightKey) return Infinity;
    if (leftKey === rightKey) return 0;
    const a = String(leftKey);
    const b = String(rightKey);
    const cacheKey = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (deltaCache.has(cacheKey)) return deltaCache.get(cacheKey);
    const leftLab = resolveKeyLab(leftKey, paletteLookupByKey, rgbCache, labCache);
    const rightLab = resolveKeyLab(rightKey, paletteLookupByKey, rgbCache, labCache);
    if (!leftLab || !rightLab) {
      deltaCache.set(cacheKey, Infinity);
      return Infinity;
    }
    const delta = deltaE2000(leftLab, rightLab);
    deltaCache.set(cacheKey, delta);
    return delta;
  };
}

function smoothSimilarColorRegions(keyGrid, paletteLookupByKey, options = {}) {
  if (!Array.isArray(keyGrid) || !keyGrid.length || !Array.isArray(keyGrid[0])) {
    return { grid: keyGrid, changedCells: 0 };
  }
  const threshold = Number.isFinite(options.threshold)
    ? Number(options.threshold)
    : DEFAULT_REGION_MERGE_DELTA_E;
  const minRegionSize = Math.max(
    2,
    Number.isFinite(options.minRegionSize) ? Math.floor(options.minRegionSize) : DEFAULT_REGION_MIN_SIZE
  );
  const majorityRatio = Math.min(
    0.95,
    Math.max(
      0.5,
      Number.isFinite(options.majorityRatio) ? Number(options.majorityRatio) : DEFAULT_REGION_MAJORITY_RATIO
    )
  );
  const height = keyGrid.length;
  const width = keyGrid[0].length;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const next = keyGrid.map((row) => row.slice());
  const delta = createKeyDeltaResolver(paletteLookupByKey);
  const profileOf = createKeyProfileResolver(paletteLookupByKey);
  const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let changedCells = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (visited[y][x]) continue;
      const startKey = next[y][x];
      if (!startKey) {
        visited[y][x] = true;
        continue;
      }
      const queue = [[x, y]];
      visited[y][x] = true;
      const region = [];
      const keyCounts = new Map();

      while (queue.length) {
        const [cx, cy] = queue.pop();
        const currentKey = next[cy][cx];
        if (!currentKey) continue;
        region.push([cx, cy]);
        keyCounts.set(currentKey, (keyCounts.get(currentKey) || 0) + 1);

        for (const [dx, dy] of dirs4) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited[ny][nx]) continue;
          const neighborKey = next[ny][nx];
          if (!neighborKey) {
            visited[ny][nx] = true;
            continue;
          }
          if (delta(currentKey, neighborKey) <= threshold) {
            visited[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }

      if (region.length < minRegionSize || !keyCounts.size) continue;
      let dominantKey = null;
      let dominantCount = 0;
      for (const [key, count] of keyCounts.entries()) {
        if (count > dominantCount) {
          dominantCount = count;
          dominantKey = key;
        }
      }
      if (!dominantKey || dominantCount === region.length) continue;
      if (dominantCount / region.length < majorityRatio) continue;
      const dominantProfile = profileOf(dominantKey);
      if (dominantProfile) {
        let minL = Infinity;
        let maxL = -Infinity;
        let darkCount = 0;
        let warmCount = 0;
        for (const [key, count] of keyCounts.entries()) {
          const profile = profileOf(key);
          if (!profile) continue;
          minL = Math.min(minL, profile.l);
          maxL = Math.max(maxL, profile.l);
          if (profile.l <= 30) darkCount += count;
          if (isWarmHue(profile.hue) && profile.chroma >= 22) warmCount += count;
        }
        const contrast = Number.isFinite(minL) && Number.isFinite(maxL) ? (maxL - minL) : 0;
        const smallRegion = region.length <= 24;
        const hasDarkDetails = darkCount >= Math.max(2, Math.floor(region.length * 0.22));
        if (smallRegion && contrast >= 22) continue;
        if (hasDarkDetails && dominantProfile.l > 40) continue;
        if (warmCount > 0 && hasDarkDetails && isWarmHue(dominantProfile.hue) && dominantProfile.l > 34) continue;
      }
      for (const [cx, cy] of region) {
        if (next[cy][cx] !== dominantKey) {
          next[cy][cx] = dominantKey;
          changedCells += 1;
        }
      }
    }
  }

  return { grid: next, changedCells };
}

function mergeLowFrequencySimilarKeys(keyGrid, paletteLookupByKey, options = {}) {
  if (!Array.isArray(keyGrid) || !keyGrid.length || !Array.isArray(keyGrid[0])) {
    return { grid: keyGrid, changedCells: 0 };
  }
  const threshold = Number.isFinite(options.threshold)
    ? Number(options.threshold)
    : DEFAULT_SIMILARITY_MERGE_DELTA_E;
  const minBaseCount = Number.isFinite(options.minRareCount)
    ? Math.max(1, Math.floor(options.minRareCount))
    : 0;
  const height = keyGrid.length;
  const width = keyGrid[0].length;
  const counts = new Map();
  let total = 0;
  for (const row of keyGrid) {
    for (const key of row) {
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      total += 1;
    }
  }
  if (!counts.size || total === 0) return { grid: keyGrid, changedCells: 0 };
  const minRareCount = Math.max(minBaseCount, Math.floor(total * 0.008), 6);
  const sortedKeys = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map((entry) => entry[0]);
  if (sortedKeys.length <= 1) return { grid: keyGrid, changedCells: 0 };

  const delta = createKeyDeltaResolver(paletteLookupByKey);
  const profileOf = createKeyProfileResolver(paletteLookupByKey);
  const mergeMap = new Map();
  for (let sourceIndex = sortedKeys.length - 1; sourceIndex >= 1; sourceIndex -= 1) {
    const sourceKey = sortedKeys[sourceIndex];
    const sourceCount = counts.get(sourceKey) || 0;
    if (sourceCount > minRareCount) continue;
    let bestTarget = null;
    let bestScore = Infinity;
    for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex += 1) {
      const targetKey = sortedKeys[targetIndex];
      if (targetKey === sourceKey) continue;
      const targetCount = counts.get(targetKey) || 0;
      if (targetCount < Math.max(sourceCount + 1, Math.floor(sourceCount * 1.25))) continue;
      const colorDelta = delta(sourceKey, targetKey);
      if (!Number.isFinite(colorDelta) || colorDelta > threshold) continue;
      const sourceProfile = profileOf(sourceKey);
      const targetProfile = profileOf(targetKey);
      if (sourceProfile && targetProfile) {
        const luminanceJump = Math.abs(sourceProfile.l - targetProfile.l);
        const sourceIsDark = sourceProfile.l <= 32;
        const sourceIsNeutral = sourceProfile.chroma <= 10;
        const targetIsWarm = isWarmHue(targetProfile.hue);
        const targetIsSaturatedWarm = targetIsWarm && targetProfile.chroma >= 20;
        if (sourceIsDark && targetIsSaturatedWarm && targetProfile.l >= 42) continue;
        if (sourceIsNeutral && targetProfile.chroma >= 28 && luminanceJump >= 14) continue;
        if (luminanceJump >= 24 && sourceCount <= minRareCount * 2) continue;
      }
      const score = colorDelta - Math.log(targetCount + 1) * 0.12;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = targetKey;
      }
    }
    if (bestTarget) {
      mergeMap.set(sourceKey, bestTarget);
    }
  }

  if (!mergeMap.size) return { grid: keyGrid, changedCells: 0 };
  const next = keyGrid.map((row) => row.slice());
  let changedCells = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = next[y][x];
      if (!key || !mergeMap.has(key)) continue;
      next[y][x] = mergeMap.get(key);
      changedCells += 1;
    }
  }
  return { grid: next, changedCells };
}

function refineKeyGridColors(keyGrid, paletteLookupByKey, options = {}) {
  const smoothThreshold = Number.isFinite(options.smoothThreshold)
    ? Number(options.smoothThreshold)
    : DEFAULT_REGION_MERGE_DELTA_E;
  const mergeThreshold = Number.isFinite(options.mergeThreshold)
    ? Number(options.mergeThreshold)
    : DEFAULT_SIMILARITY_MERGE_DELTA_E;
  const smoothRounds = Math.max(
    0,
    Number.isFinite(options.smoothRounds) ? Math.floor(options.smoothRounds) : 1
  );
  const smoothMinRegionSize = Math.max(
    2,
    Number.isFinite(options.smoothMinRegionSize)
      ? Math.floor(options.smoothMinRegionSize)
      : DEFAULT_REGION_MIN_SIZE
  );
  const smoothMajorityRatio = Math.min(
    0.95,
    Math.max(
      0.5,
      Number.isFinite(options.smoothMajorityRatio)
        ? Number(options.smoothMajorityRatio)
        : DEFAULT_REGION_MAJORITY_RATIO
    )
  );

  let refined = keyGrid;
  for (let round = 0; round < smoothRounds; round += 1) {
    const smoothed = smoothSimilarColorRegions(refined, paletteLookupByKey, {
      threshold: smoothThreshold,
      minRegionSize: smoothMinRegionSize,
      majorityRatio: smoothMajorityRatio
    });
    refined = smoothed.grid;
    if (!smoothed.changedCells) break;
  }

  const merged = mergeLowFrequencySimilarKeys(refined, paletteLookupByKey, {
    threshold: mergeThreshold
  });
  refined = merged.grid;
  if (merged.changedCells > 0 && smoothRounds > 0) {
    const finalSmooth = smoothSimilarColorRegions(refined, paletteLookupByKey, {
      threshold: smoothThreshold,
      minRegionSize: smoothMinRegionSize,
      majorityRatio: smoothMajorityRatio
    });
    refined = finalSmooth.grid;
  }
  return refined;
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
  const similarityThresholdRaw = Number(options.similarityThreshold);
  const similarityThreshold = Number.isFinite(similarityThresholdRaw)
    ? Math.max(0, Math.min(120, similarityThresholdRaw))
    : 30;
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

    const cleanedKeyGrid = removeBorderConnectedWhiteBackground(keyGrid, null);
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
  const opaquePalette = paletteColors.filter((item) => item && item.rgb && !item.transparent);
  if (!opaquePalette.length) {
    throw new Error("palette-has-no-opaque-colors");
  }
  const paletteOrderKeys = paletteColors.map((item) => getPaletteItemKey(item));
  const paletteLookupByKey = new Map(paletteColors.map((item) => [getPaletteItemKey(item), item]));
  const firstOpaqueItem = opaquePalette[0] || null;
  const firstOpaqueKey = firstOpaqueItem ? getPaletteItemKey(firstOpaqueItem) : (paletteOrderKeys[0] || null);

  // Zippland style pipeline: cell representative color -> nearest palette RGB -> global similar-color merge by frequency.
  const keyGrid = [];
  for (let y = 0; y < gridSize; y += 1) {
    const row = [];
    for (let x = 0; x < gridSize; x += 1) {
      const rep = representativeColors[y * gridSize + x];
      if (!rep) {
        row.push(null);
        continue;
      }
      const closest = nearestPaletteColor({
        r: Math.round(rep.r),
        g: Math.round(rep.g),
        b: Math.round(rep.b)
      }, opaquePalette);
      row.push(closest ? getPaletteItemKey(closest) : firstOpaqueKey);
    }
    keyGrid.push(row);
  }

  const mergedKeyGrid = mergeSimilarPaletteKeysByFrequency(
    keyGrid,
    paletteLookupByKey,
    similarityThreshold
  );
  const cleanedKeyGrid = removeBorderConnectedWhiteBackground(mergedKeyGrid, paletteLookupByKey);
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

function normalizePdfMode(mode) {
  return mode === "ultra" ? "ultra" : "a4";
}

function normalizePdfPaperSize(size) {
  return String(size || "").toUpperCase() === "A3" ? "A3" : "A4";
}

function computePagedDetailPlan({ gridSize, paperSize }) {
  const safeGrid = Math.max(1, Number(gridSize) || 1);
  const normalizedPaperSize = normalizePdfPaperSize(paperSize);
  const preferredCells = normalizedPaperSize === "A3" ? 28 : 20;
  const cellsPerPage = Math.min(safeGrid, Math.max(12, preferredCells));
  return {
    paperSize: normalizedPaperSize,
    cellsPerPage,
    pagesX: Math.max(1, Math.ceil(safeGrid / cellsPerPage)),
    pagesY: Math.max(1, Math.ceil(safeGrid / cellsPerPage))
  };
}

function drawPdfGridBlock(doc, options) {
  const {
    grid,
    codeGrid,
    startX,
    startY,
    cellSize,
    coordBand,
    offsetX = 0,
    offsetY = 0,
    axisStep = 1,
    showCodes = true,
    maxCodeSize = 12,
    tintAlpha = 0.16
  } = options;

  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;

  doc.save();
  doc.fillColor("#ffffff");
  doc.rect(startX, startY, gridWidth, gridHeight).fill();
  doc.restore();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const hex = grid[y][x];
      if (hex) {
        doc.rect(startX + x * cellSize, startY + y * cellSize, cellSize, cellSize).fill(hex);
      }
    }
  }

  if (tintAlpha > 0) {
    doc.save();
    doc.fillOpacity(tintAlpha).fillColor("#FFFFFF");
    doc.rect(startX, startY, gridWidth, gridHeight).fill();
    doc.restore();
  }

  if (showCodes) {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const hex = grid[y][x];
        const cellCode = codeGrid && codeGrid[y] ? codeGrid[y][x] : null;
        if (cellCode && hex) {
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
  }

  const thinLineWidth = Math.max(0.35, Math.min(1.2, cellSize * 0.05));
  doc.lineWidth(thinLineWidth).strokeColor("#222222");
  for (let i = 0; i <= cols; i += 1) {
    const x = startX + i * cellSize;
    doc.moveTo(x, startY).lineTo(x, startY + gridHeight).stroke();
  }
  for (let i = 0; i <= rows; i += 1) {
    const y = startY + i * cellSize;
    doc.moveTo(startX, y).lineTo(startX + gridWidth, y).stroke();
  }

  const thickLineWidth = Math.max(1, Math.min(2.4, cellSize * 0.14));
  doc.lineWidth(thickLineWidth).strokeColor("#111111");
  for (let i = 0; i <= cols; i += 1) {
    if (i !== cols && (offsetX + i) % 5 !== 0) continue;
    const x = startX + i * cellSize;
    doc.moveTo(x, startY).lineTo(x, startY + gridHeight).stroke();
  }
  for (let i = 0; i <= rows; i += 1) {
    if (i !== rows && (offsetY + i) % 5 !== 0) continue;
    const y = startY + i * cellSize;
    doc.moveTo(startX, y).lineTo(startX + gridWidth, y).stroke();
  }

  const coordFontSize = Math.max(6, Math.min(10, Math.floor(cellSize * 0.44)));
  const topY = startY - coordBand + (coordBand - coordFontSize) / 2;
  const bottomY = startY + gridHeight + (coordBand - coordFontSize) / 2;
  const safeAxisStep = Math.max(1, axisStep);
  const xMarks = [];
  const yMarks = [];
  for (let i = 1; i <= cols; i += safeAxisStep) {
    xMarks.push(i);
  }
  for (let i = 1; i <= rows; i += safeAxisStep) {
    yMarks.push(i);
  }
  if (!xMarks.includes(cols)) xMarks.push(cols);
  if (!yMarks.includes(rows)) yMarks.push(rows);
  doc.fontSize(coordFontSize).fillColor("#111111");
  for (const i of xMarks) {
    const centerX = startX + (i - 1) * cellSize;
    const label = String(offsetX + i);
    doc.text(label, centerX, topY, { width: cellSize, align: "center", lineBreak: false });
    doc.text(label, centerX, bottomY, { width: cellSize, align: "center", lineBreak: false });
  }
  for (const i of yMarks) {
    const centerY = startY + (i - 1) * cellSize + (cellSize - coordFontSize) / 2 - 0.5;
    const label = String(offsetY + i);
    doc.text(label, startX - coordBand + 1, centerY, { width: coordBand - 2, align: "center", lineBreak: false });
    doc.text(label, startX + gridWidth + 1, centerY, { width: coordBand - 2, align: "center", lineBreak: false });
  }

  return {
    rows,
    cols,
    gridWidth,
    gridHeight
  };
}

function sortLegendByCode(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aCode = String(a && a.code ? a.code : "");
    const bCode = String(b && b.code ? b.code : "");
    if (aCode && bCode) {
      return aCode.localeCompare(bCode, "en", { numeric: true, sensitivity: "base" });
    }
    if (aCode) return -1;
    if (bCode) return 1;
    return (b && b.count ? b.count : 0) - (a && a.count ? a.count : 0);
  });
}

function buildLegendLookupByHex(legend) {
  const lookup = new Map();
  for (const item of Array.isArray(legend) ? legend : []) {
    const hex = item && (item.hex || item.color);
    if (!hex || lookup.has(hex)) continue;
    lookup.set(hex, item);
  }
  return lookup;
}

function buildLegendForSlice(sliceGrid, sliceCodeGrid, legendLookupByHex) {
  const counts = new Map();
  const metaByHex = new Map();
  for (let y = 0; y < sliceGrid.length; y += 1) {
    const row = sliceGrid[y];
    for (let x = 0; x < row.length; x += 1) {
      const hex = row[x];
      if (!hex) continue;
      counts.set(hex, (counts.get(hex) || 0) + 1);
      if (!metaByHex.has(hex)) {
        const source = legendLookupByHex.get(hex) || null;
        const codeFromGrid = sliceCodeGrid && sliceCodeGrid[y] ? sliceCodeGrid[y][x] : null;
        metaByHex.set(hex, {
          code: codeFromGrid || (source && source.code) || null,
          name: source && source.name ? source.name : null
        });
      }
    }
  }
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0) || 1;
  const legend = Array.from(counts.entries()).map(([hex, count], index) => {
    const meta = metaByHex.get(hex) || {};
    return {
      index: index + 1,
      hex,
      color: hex,
      code: meta.code || null,
      name: meta.name || null,
      count,
      percent: Math.round((count / total) * 1000) / 10
    };
  });
  return sortLegendByCode(legend);
}

function drawPdfLegendSection(doc, options) {
  const {
    legend,
    margin,
    availableWidth,
    startY,
    mode = "a4",
    title = "Palette / Beads",
    compact = false
  } = options;

  const normalizedMode = normalizePdfMode(mode);
  const legendGapX = compact ? 6 : (normalizedMode === "a4" ? 8 : 10);
  const cardHeight = compact ? 24 : (normalizedMode === "a4" ? 34 : 36);
  const rowHeight = cardHeight + (compact ? 6 : (normalizedMode === "a4" ? 8 : 9));
  const codeFontSize = compact ? 9 : (normalizedMode === "a4" ? 12 : 13);
  const metaFontSize = compact ? 8 : (normalizedMode === "a4" ? 10 : 11);
  const swatchSize = compact ? 9 : (normalizedMode === "a4" ? 12 : 13);
  const safeLegend = sortLegendByCode(legend || []);
  const columns = computeAdaptiveLegendColumns({
    availableWidth,
    itemCount: safeLegend.length,
    mode: normalizedMode
  });
  const maxColumns = compact ? 6 : columns;
  const safeColumns = Math.max(1, Math.min(maxColumns, columns));
  const sectionTitle = String(title || "Palette / Beads");
  const safeItemCount = Math.max(1, safeLegend.length);
  const rows = Math.ceil(safeItemCount / safeColumns);
  const sectionTitleHeight = compact ? 12 : 14;
  const sectionPaddingBottom = compact ? 2 : 4;
  if (!safeLegend.length) {
    doc.fontSize(compact ? 8 : 11).fillColor("#111111").text(sectionTitle, margin, startY - sectionTitleHeight);
    doc.fontSize(compact ? 8 : 10).fillColor("#666666").text("No colors on this page", margin, startY + 2);
    return sectionTitleHeight + rowHeight + sectionPaddingBottom;
  }
  const colWidth = Math.floor((availableWidth - legendGapX * (safeColumns - 1)) / safeColumns);

  doc.fontSize(compact ? 8 : 11).fillColor("#111111").text(sectionTitle, margin, startY - sectionTitleHeight);

  safeLegend.forEach((item, idx) => {
    const col = idx % safeColumns;
    const row = Math.floor(idx / safeColumns);
    const cardX = margin + col * (colWidth + legendGapX);
    const cardY = startY + row * rowHeight;
    const swatchHex = item.hex || item.color || "#000000";
    const code = item.code || `#${item.index}`;

    doc.save();
    doc.lineWidth(compact ? 0.5 : 0.7).strokeColor("#d7c8ad").fillColor("#fffaf1");
    doc.roundedRect(cardX, cardY, colWidth, cardHeight, 6).fillAndStroke();
    doc.restore();

    const swatchY = cardY + Math.floor((cardHeight - swatchSize) / 2);
    doc.rect(cardX + 10, swatchY, swatchSize, swatchSize).fill(swatchHex);
    const textStartX = compact ? cardX + 23 : cardX + 29;
    const textWidth = compact ? colWidth - 26 : colWidth - 35;
    doc.fontSize(codeFontSize).fillColor("#1f1f1f").text(code, textStartX, compact ? cardY + 3 : cardY + 5, {
      width: textWidth,
      lineBreak: false
    });
    doc.fontSize(metaFontSize).fillColor("#4d4d4d").text(`${item.count} beads`, textStartX, compact ? cardY + 13 : cardY + 19, {
      width: textWidth,
      lineBreak: false
    });
    if (!compact) {
      doc.fontSize(metaFontSize).fillColor("#6a6a6a").text(`${item.percent}%`, textStartX + Math.max(30, textWidth - 48), cardY + 19, {
        width: 44,
        align: "right",
        lineBreak: false
      });
    }
  });

  return sectionTitleHeight + rows * rowHeight + sectionPaddingBottom;
}

function formatPatternHeaderTitle(title, width, height, colorCount, beadCount) {
  const safeTitle = sanitizePdfTitle(title || "Bead Pattern");
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const safeColors = Math.max(0, Number(colorCount) || 0);
  const safeBeads = Math.max(0, Number(beadCount) || 0);
  return `${safeTitle} [${safeWidth}x${safeHeight}/${safeColors} colors/${safeBeads} beads]`;
}

function computeLegendBlockHeight({ itemCount, availableWidth, mode, compact = false }) {
  const normalizedMode = normalizePdfMode(mode);
  const columns = computeAdaptiveLegendColumns({
    availableWidth,
    itemCount,
    mode: normalizedMode
  });
  const safeColumns = Math.max(1, Math.min(compact ? 6 : columns, columns));
  const rows = Math.ceil(Math.max(1, itemCount) / safeColumns);
  const rowHeight = compact
    ? 30
    : (normalizedMode === "a4" ? 42 : 45);
  const titleHeight = compact ? 12 : 14;
  const bottomPadding = compact ? 2 : 4;
  return titleHeight + rows * rowHeight + bottomPadding;
}

function drawPdfTileTitle(doc, options) {
  const {
    title,
    margin,
    pageWidth,
    startCol,
    startRow,
    cols,
    rows,
    pageIndex,
    totalPages,
    sliceLegend
  } = options;
  const beadCount = Array.isArray(sliceLegend)
    ? sliceLegend.reduce((sum, item) => sum + (item && item.count ? item.count : 0), 0)
    : 0;
  const headerText = formatPatternHeaderTitle(
    `${title} [Page ${pageIndex}]`,
    cols,
    rows,
    Array.isArray(sliceLegend) ? sliceLegend.length : 0,
    beadCount
  );

  doc.fontSize(14).fillColor("#111111").text(headerText, margin, margin);
  doc.fontSize(9).fillColor("#6e5d47").text(
    `Crop X ${startCol + 1}-${startCol + cols} · Y ${startRow + 1}-${startRow + rows} · Page ${pageIndex}/${totalPages}`,
    margin,
    margin + 18,
    {
      width: pageWidth - margin * 2
    }
  );
}

function drawPdfTileMiniMap(doc, options) {
  const {
    x,
    y,
    size,
    gridSize,
    startRow,
    startCol,
    rows,
    cols
  } = options;
  const scale = size / gridSize;

  doc.save();
  doc.fillColor("#fbf5ea").strokeColor("#d7c8ad").lineWidth(1);
  doc.rect(x, y, size, size).fillAndStroke();
  doc.restore();

  doc.lineWidth(0.4).strokeColor("#cbbba4");
  for (let i = 5; i < gridSize; i += 5) {
    const lineX = x + i * scale;
    const lineY = y + i * scale;
    doc.moveTo(lineX, y).lineTo(lineX, y + size).stroke();
    doc.moveTo(x, lineY).lineTo(x + size, lineY).stroke();
  }

  doc.save();
  doc.fillOpacity(0.22).fillColor("#ffb866");
  doc.rect(x + startCol * scale, y + startRow * scale, cols * scale, rows * scale).fill();
  doc.restore();

  doc.lineWidth(1.4).strokeColor("#ba1f1f");
  doc.rect(x + startCol * scale, y + startRow * scale, cols * scale, rows * scale).stroke();
}

function renderPdfOverviewPage(doc, options) {
  const {
    grid,
    legend,
    title,
    codeGrid,
    mode,
    detailPlan,
    paperSize
  } = options;
  const gridSize = grid.length;
  const normalizedMode = normalizePdfMode(mode);
  const margin = normalizedMode === "a4" ? 30 : 42;
  const titleGap = 36;
  const safeLegend = sortLegendByCode(legend || []);
  const legendCount = safeLegend.length;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const availableWidth = pageWidth - margin * 2;
  const totalBeads = safeLegend.reduce((sum, item) => sum + (item && item.count ? item.count : 0), 0);
  const overviewTitle = formatPatternHeaderTitle(title, gridSize, gridSize, legendCount, totalBeads);

  if (normalizedMode !== "a4") {
    throw new Error("Overview page only supports A4 mode");
  }

  const coordBand = 10;
  const legendAreaHeight = computeLegendBlockHeight({
    itemCount: legendCount,
    availableWidth,
    mode: normalizedMode,
    compact: false
  });
  const usableHeight = pageHeight - margin * 2 - titleGap - legendAreaHeight - coordBand * 2 - 20;
  const usableWidth = availableWidth - coordBand * 2;
  const cellSize = Math.max(5, Math.floor(Math.min(usableWidth, usableHeight) / gridSize));
  const gridWidth = cellSize * gridSize;
  const startX = margin + (availableWidth - (gridWidth + coordBand * 2)) / 2 + coordBand;
  const startY = margin + titleGap + coordBand;

  doc.fontSize(16).fillColor("#111111").text(overviewTitle, margin, margin, {
    width: availableWidth,
    lineBreak: false
  });
  const detailPages = detailPlan.pagesX * detailPlan.pagesY;
  doc.fontSize(10).fillColor("#6e5d47").text(
    detailPages > 1
      ? `Overview · ${detailPages} detail pages on ${normalizePdfPaperSize(paperSize)} · approx ${detailPlan.cellsPerPage}x${detailPlan.cellsPerPage} cells/page`
      : "Overview",
    margin,
    margin + 18
  );

  drawPdfGridBlock(doc, {
    grid,
    codeGrid,
    startX,
    startY,
    cellSize,
    coordBand,
    axisStep: gridSize > 60 ? 5 : 1,
    showCodes: true,
    maxCodeSize: 10,
    tintAlpha: 0.12
  });

  if (detailPages > 1) {
    doc.save();
    doc.lineWidth(Math.max(1.1, cellSize * 0.15)).strokeColor("#ba1f1f").strokeOpacity(0.82);
    for (let i = detailPlan.cellsPerPage; i < gridSize; i += detailPlan.cellsPerPage) {
      const x = startX + i * cellSize;
      const y = startY + i * cellSize;
      doc.moveTo(x, startY).lineTo(x, startY + gridWidth).stroke();
      doc.moveTo(startX, y).lineTo(startX + gridWidth, y).stroke();
    }
    doc.restore();
  }

  drawPdfLegendSection(doc, {
    legend: safeLegend,
    margin,
    availableWidth,
    startY: startY + gridWidth + 24,
    mode: normalizedMode,
    title: "Full Pattern Palette / Beads"
  });
}

function appendPdfDetailPages(doc, options) {
  const {
    grid,
    codeGrid,
    title,
    detailPlan,
    legend,
    mode,
    paperSize
  } = options;
  const totalPages = detailPlan.pagesX * detailPlan.pagesY;
  if (totalPages <= 1) return;

  const normalizedMode = normalizePdfMode(mode);
  const normalizedPaperSize = normalizePdfPaperSize(paperSize);
  const margin = normalizedMode === "a4" ? 30 : 42;
  const legendLookupByHex = buildLegendLookupByHex(legend);

  for (let pageY = 0; pageY < detailPlan.pagesY; pageY += 1) {
    for (let pageX = 0; pageX < detailPlan.pagesX; pageX += 1) {
      doc.addPage({
        size: normalizedPaperSize,
        margin
      });

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const coordBand = 16;
      const headerHeight = 66;
      const footerHeight = 18;
      const startCol = pageX * detailPlan.cellsPerPage;
      const startRow = pageY * detailPlan.cellsPerPage;
      const cols = Math.min(detailPlan.cellsPerPage, grid.length - startCol);
      const rows = Math.min(detailPlan.cellsPerPage, grid.length - startRow);
      const sliceGrid = grid.slice(startRow, startRow + rows).map((row) => row.slice(startCol, startCol + cols));
      const sliceCodeGrid = codeGrid
        ? codeGrid.slice(startRow, startRow + rows).map((row) => row.slice(startCol, startCol + cols))
        : null;
      const sliceLegend = buildLegendForSlice(sliceGrid, sliceCodeGrid, legendLookupByHex);

      const availableWidth = pageWidth - margin * 2 - coordBand * 2;
      const legendAreaHeight = computeLegendBlockHeight({
        itemCount: sliceLegend.length,
        availableWidth: pageWidth - margin * 2,
        mode: normalizedMode,
        compact: true
      });
      const availableHeight = pageHeight - margin * 2 - headerHeight - footerHeight - coordBand * 2 - legendAreaHeight - 16;
      const cellSize = Math.max(11, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));
      const gridWidth = cols * cellSize;
      const gridHeight = rows * cellSize;
      const startX = margin + (pageWidth - margin * 2 - (gridWidth + coordBand * 2)) / 2 + coordBand;
      const startY = margin + headerHeight + coordBand;
      const pageIndex = pageY * detailPlan.pagesX + pageX + 1;

      drawPdfTileTitle(doc, {
        title,
        margin,
        pageWidth,
        startCol,
        startRow,
        cols,
        rows,
        pageIndex,
        totalPages,
        sliceLegend
      });

      drawPdfTileMiniMap(doc, {
        x: pageWidth - margin - 82,
        y: margin + 4,
        size: 78,
        gridSize: grid.length,
        startRow,
        startCol,
        rows,
        cols
      });

      drawPdfGridBlock(doc, {
        grid: sliceGrid,
        codeGrid: sliceCodeGrid,
        startX,
        startY,
        cellSize,
        coordBand,
        offsetX: startCol,
        offsetY: startRow,
        showCodes: true,
        maxCodeSize: 11,
        tintAlpha: 0.1
      });

      drawPdfLegendSection(doc, {
        legend: sliceLegend,
        margin,
        availableWidth: pageWidth - margin * 2,
        startY: startY + gridHeight + 22,
        mode: normalizedMode,
        title: "Page Palette / Beads",
        compact: true
      });

      doc.fontSize(8.5).fillColor("#6e5d47").text(
        `${normalizedPaperSize} · Page ${pageIndex}/${totalPages}`,
        margin,
        pageHeight - margin - 10,
        { width: pageWidth - margin * 2, align: "right", lineBreak: false }
      );
    }
  }
}

function renderPdfFromGrid({ grid, legend, title, codeGrid, mode = "a4", paperSize = "A4" }) {
  const gridSize = grid.length;
  const normalizedMode = normalizePdfMode(mode);
  const normalizedPaperSize = normalizePdfPaperSize(paperSize);
  const safeLegend = sortLegendByCode(legend || []);
  const totalBeads = safeLegend.reduce((sum, item) => sum + (item && item.count ? item.count : 0), 0);
  const coverTitle = formatPatternHeaderTitle(title, gridSize, gridSize, safeLegend.length, totalBeads);

  if (normalizedMode === "ultra") {
    const margin = 42;
    const cellSize = gridSize >= 100 ? 18 : gridSize >= 80 ? 20 : 24;
    const coordBand = Math.max(12, Math.floor(cellSize * 0.62));
    const gridBlock = cellSize * gridSize + coordBand * 2;
    const pageWidth = Math.max(1300, gridBlock + margin * 2);
    const availableWidth = pageWidth - margin * 2;
    const columns = computeAdaptiveLegendColumns({
      availableWidth,
      itemCount: safeLegend.length,
      mode: normalizedMode
    });
    const legendRows = Math.max(1, Math.ceil(Math.max(1, safeLegend.length) / Math.max(1, columns)));
    const legendAreaHeight = 52 + legendRows * 45;
    const pageHeight = Math.max(1000, margin + 34 + gridBlock + 24 + legendAreaHeight + margin);
    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margin
    });

    const startX = margin + (availableWidth - (cellSize * gridSize + coordBand * 2)) / 2 + coordBand;
    const startY = margin + 34 + coordBand;
    doc.fontSize(16).fillColor("#111111").text(coverTitle, margin, margin, {
      width: availableWidth,
      lineBreak: false
    });
    drawPdfGridBlock(doc, {
      grid,
      codeGrid,
      startX,
      startY,
      cellSize,
      coordBand,
      axisStep: 1,
      showCodes: true,
      maxCodeSize: 13,
      tintAlpha: 0.18
    });
    drawPdfLegendSection(doc, {
      legend: safeLegend,
      margin,
      availableWidth,
      startY: startY + cellSize * gridSize + 24,
      mode: normalizedMode,
      title: "Full Pattern Palette / Beads"
    });
    return doc;
  }

  const doc = new PDFDocument({
    size: normalizedPaperSize,
    margin: 30
  });
  const detailPlan = computePagedDetailPlan({
    gridSize,
    paperSize: normalizedPaperSize
  });
  renderPdfOverviewPage(doc, {
    grid,
    legend: safeLegend,
    title: sanitizePdfTitle(title || "Bead Pattern"),
    codeGrid,
    mode: normalizedMode,
    detailPlan,
    paperSize: normalizedPaperSize
  });
  appendPdfDetailPages(doc, {
    grid,
    codeGrid,
    title: sanitizePdfTitle(title || "Bead Pattern"),
    detailPlan,
    legend: safeLegend,
    mode: normalizedMode,
    paperSize: normalizedPaperSize
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

function createPdfBufferFromGrid({ grid, legend, title, codeGrid, mode = "a4", paperSize = "A4" }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = renderPdfFromGrid({ grid, legend, title, codeGrid, mode, paperSize });
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

async function sendPdfDownload(res, { grid, legend, title, codeGrid, mode, paperSize, filename, logTag }) {
  const normalizedMode = normalizePdfMode(mode);
  const normalizedPaperSize = normalizePdfPaperSize(paperSize);
  const safeFilename = filename || "bead-pattern.pdf";
  const pdfBuffer = await createPdfBufferFromGrid({
    grid,
    legend,
    title,
    codeGrid,
    mode: normalizedMode,
    paperSize: normalizedPaperSize
  });

  const usedCells = countNonEmptyGridCells(grid);
  const legendCount = Array.isArray(legend) ? legend.length : 0;
  console.log(
    `[${logTag || "pdf-export"}] mode=${normalizedMode} paper=${normalizedPaperSize} grid=${grid.length} used=${usedCells} legend=${legendCount} bytes=${pdfBuffer.length}`
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
    const { grid, legend, codeGrid, title, pdfMode, pdfPaperSize } = req.body || {};
    if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) {
      return res.status(400).json({ error: "缺少有效网格数据。" });
    }

    const safeLegend = Array.isArray(legend) ? legend : buildLegend(grid);
    await sendPdfDownload(res, {
      grid,
      legend: safeLegend,
      title: title || "Bead Pattern",
      codeGrid: codeGrid || null,
      mode: normalizePdfMode(pdfMode),
      paperSize: normalizePdfPaperSize(pdfPaperSize),
      filename: "bead-pattern.pdf",
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
      const pdfMode = normalizePdfMode(req.body.pdfMode);
      const pdfPaperSize = normalizePdfPaperSize(req.body.pdfPaperSize);
      await sendPdfDownload(res, {
        grid,
        legend,
        title,
        codeGrid,
        mode: pdfMode,
        paperSize: pdfPaperSize,
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
    const similarityThresholdRaw = Number(
      req.body.similarityThreshold !== undefined
        ? req.body.similarityThreshold
        : req.body.mergeDeltaE
    );
    const similarityThreshold = Number.isFinite(similarityThresholdRaw)
      ? Math.max(4, Math.min(80, similarityThresholdRaw))
      : 30;

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
      optimizePasses,
      similarityThreshold
    });

    if (output === "pdf") {
      const pdfMode = normalizePdfMode(req.body.pdfMode);
      const pdfPaperSize = normalizePdfPaperSize(req.body.pdfPaperSize);
      await sendPdfDownload(res, {
        grid: result.grid,
        legend: result.legend,
        title: "Bead Pattern",
        codeGrid: result.codeGrid,
        mode: pdfMode,
        paperSize: pdfPaperSize,
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
