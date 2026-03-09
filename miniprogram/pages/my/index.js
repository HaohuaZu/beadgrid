const {
  quantizeToPalette,
  formatGridDate
} = require("../../utils/pixel-converter");
const { packIndexGrid, unpackIndexGrid } = require("../../utils/grid-pack");
const { MARD221_COLORS } = require("../../utils/mard221");

const STORAGE_KEY = "bead_work_library_v1";
const BACKUP_STORAGE_KEY = "bead_work_library_backup_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";
const STORAGE_SEEDED_KEY = "bead_work_library_seeded_v1";
const MAX_STORED_WORKS = 20;
const MAX_EDITABLE_WORKS = 12;
const MAX_EDITOR_CELLS = 40000;
const DEFAULT_EDITOR_BG = "#FFFFFF";
const DEFAULT_BLANK_CANVAS_EDGE = 36;
const BLANK_CANVAS_STYLE = "空白画布";
const EDITOR_DATA_SCHEMA_VERSION = 3;
const EDITOR_PALETTE = (Array.isArray(MARD221_COLORS) ? MARD221_COLORS : [])
  .filter((item) => item && item.hex)
  .sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)));
const EDITOR_MAX_INDEX = Math.max(0, EDITOR_PALETTE.length - 1);
const PALETTE_HEX_BY_INDEX = EDITOR_PALETTE.map((item) => String((item && item.hex) || "#FFFFFF").toUpperCase());
const PALETTE_INDEX_BY_HEX = EDITOR_PALETTE.reduce((acc, item, index) => {
  if (item && item.hex) {
    acc[item.hex.toUpperCase()] = index;
  }
  return acc;
}, Object.create(null));
const DEFAULT_EDITOR_BG_INDEX = (() => {
  const directMatch = PALETTE_INDEX_BY_HEX[DEFAULT_EDITOR_BG];
  if (Number.isFinite(directMatch) && directMatch >= 0) return directMatch;
  const target = parseHexRgb(DEFAULT_EDITOR_BG);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  PALETTE_HEX_BY_INDEX.forEach((hex, index) => {
    const delta = distanceSqRgb(parseHexRgb(hex), target);
    if (delta < bestDistance) {
      bestDistance = delta;
      bestIndex = index;
    }
  });
  return bestIndex;
})();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseHexRgb(hex) {
  const raw = String(hex || "").replace("#", "").trim();
  if (raw.length !== 6) return { r: 255, g: 255, b: 255 };
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return { r: 255, g: 255, b: 255 };
  }
  return { r, g, b };
}

function distanceSqRgb(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function computeRgbProfile(rgb) {
  const safe = rgb || { r: 255, g: 255, b: 255 };
  const r = Number(safe.r) || 0;
  const g = Number(safe.g) || 0;
  const b = Number(safe.b) || 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue /= 6;
    if (hue < 0) hue += 1;
  }
  const saturation = max <= 0 ? 0 : delta / max;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return {
    hue,
    saturation,
    luminance,
    chroma: delta
  };
}

function hueDistance(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  let diff = Math.abs(left - right);
  if (diff > 0.5) diff = 1 - diff;
  return diff;
}

function isIllustrationSourceKind(kind) {
  return kind === SOURCE_KIND_ILLUSTRATION || kind === SOURCE_KIND_CLEAN_ILLUSTRATION;
}

const PALETTE_LUMA_BY_INDEX = EDITOR_PALETTE.map((item) => {
  const rgb = item && item.rgb ? item.rgb : parseHexRgb(item && item.hex);
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
});
const PALETTE_CHROMA_BY_INDEX = EDITOR_PALETTE.map((item) => {
  const rgb = item && item.rgb ? item.rgb : parseHexRgb(item && item.hex);
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
});
const DARKEST_PALETTE_INDEX = (() => {
  let idx = 0;
  let minLum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < PALETTE_LUMA_BY_INDEX.length; i += 1) {
    const lum = Number(PALETTE_LUMA_BY_INDEX[i]);
    if (!Number.isFinite(lum)) continue;
    if (lum < minLum) {
      minLum = lum;
      idx = i;
    }
  }
  return idx;
})();
const DARK_OUTLINE_LUMA_THRESHOLD = 82;
const DARK_OUTLINE_CHROMA_THRESHOLD = 96;
const CARTOON_MAX_COLOR_LIMIT = 44;
const FINE_MAX_COLOR_LIMIT = 52;
const CARTOON_MIN_COLOR_LIMIT = 22;
const FINE_MIN_COLOR_LIMIT = 28;
const PREVIEW_FILE_PREFIX = "bead_preview";
const PREVIEW_RETRY_DELAY_MS = 140;
const PREVIEW_ERROR_RETRY_LIMIT = 2;
const STYLE_MODE_FINE = "fine";
const STYLE_MODE_CARTOON = "cartoon";
const SOURCE_KIND_PHOTO = "photo";
const SOURCE_KIND_ILLUSTRATION = "illustration";
const SOURCE_KIND_CLEAN_ILLUSTRATION = "illustration_clean";
const STYLE_LABEL_MAP = {
  [STYLE_MODE_FINE]: "精致像素",
  [STYLE_MODE_CARTOON]: "卡通像素（Q版）"
};
const Q_STYLE_UPLOAD_FIELD_NAME = "image";
const Q_STYLE_REQUEST_TIMEOUT_MS = 60000;

const DEMO_WORK_LIBRARY = [
  {
    id: "w-1",
    title: "AI生成拼豆作品1",
    date: "24分钟前",
    size: "54x54",
    style: "精致像素",
    status: "已完成",
    isGenerating: false,
    isFailed: false,
    views: 46,
    saves: 18,
    clones: 9,
    earnCoin: 27,
    previewTones: {
      origin: "origin-a",
      ai: "ai-a",
      grid: "grid-a"
    },
    previewImages: {
      origin: "",
      ai: "",
      grid: ""
    }
  },
  {
    id: "w-2",
    title: "AI生成拼豆作品2",
    date: "4天前",
    size: "79x79",
    style: "精致像素",
    status: "已完成",
    isGenerating: false,
    isFailed: false,
    views: 52,
    saves: 21,
    clones: 10,
    earnCoin: 31,
    previewTones: {
      origin: "origin-b",
      ai: "ai-b",
      grid: "grid-b"
    },
    previewImages: {
      origin: "",
      ai: "",
      grid: ""
    }
  }
];

Page({
  data: {
    showUploadModal: false,
    showNamingModal: false,
    showWorkPreviewModal: false,
    previewWorkTitle: "",
    previewLabel: "",
    previewTone: "origin-a",
    previewImagePath: "",
    previewIsPixel: false,
    uploadImagePath: "",
    uploadImageName: "",
    uploadImageSizeText: "",
    uploadPreviewError: false,
    namingDraft: "",
    namingError: "",
    selectedCostMode: "standard",
    selectedStyleMode: STYLE_MODE_FINE,
    selectedMaxEdge: "52",
    customMaxEdge: "",
    costHintText: "转换一次花费1拼豆币，当前拼豆币：12",
    styleHintText: "保持当前精致像素算法，细节更稳定。",
    coinBalance: 12,
    totalCloneCount: 0,
    isConverting: false,
    processCanvasSize: 52,
    renderCanvasSize: 520,
    workLibrary: DEMO_WORK_LIBRARY,
    displayWorks: []
  },
  onLoad() {
    this.previewErrorCount = Object.create(null);
    this.previewRetryNonce = Object.create(null);
    this.previewHiddenMap = Object.create(null);
    this.previewRetryTimers = Object.create(null);
    this.previewPathSnapshot = Object.create(null);
    this.previewMigrationRunning = false;
    try {
      const info = typeof wx.getWindowInfo === "function"
        ? wx.getWindowInfo()
        : (typeof wx.getSystemInfoSync === "function" ? wx.getSystemInfoSync() : null);
      const ratio = Number(info && info.pixelRatio) || 1;
      this.previewPixelRatio = clamp(ratio, 1, 2);
    } catch (error) {
      this.previewPixelRatio = 1;
    }
    this.loadWorkLibrary();
  },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({ selected: 1 });
    }
    this.loadWorkLibrary();

    const app = getApp && getApp();
    const shouldAutoOpen = Boolean(
      app
      && app.globalData
      && (app.globalData.openUploadModalOnCreateTab || app.globalData.openUploadModalOnMyTab)
    );
    if (shouldAutoOpen && !this.data.isConverting) {
      app.globalData.openUploadModalOnCreateTab = false;
      app.globalData.openUploadModalOnMyTab = false;
      this.resetUploadModal();
      this.setData({ showUploadModal: true });
    }
    if (typeof wx.nextTick === "function") {
      wx.nextTick(() => this.ensureWorkPreviews());
    } else {
      setTimeout(() => this.ensureWorkPreviews(), 0);
    }
  },
  onHide() {
    this.clearPreviewRetryTimers();
    if (this.isPickingImage) return;
    if (this.data.showUploadModal || this.data.showWorkPreviewModal) {
      this.handleCloseModal();
      this.handleCloseWorkPreview();
    }
  },
  onUnload() {
    this.clearPreviewRetryTimers();
  },
  parseGridSizeFromText(sizeText) {
    const matched = String(sizeText || "").match(/(\d+)\s*x\s*(\d+)/i);
    if (!matched) return 0;
    const width = Number(matched[1]) || 0;
    const height = Number(matched[2]) || 0;
    if (width <= 0 || height <= 0) return 0;
    return Math.max(width, height);
  },
  normalizeVisibleBoundsForEditor(rawBounds, gridSize) {
    const size = Math.max(1, Number(gridSize) || 0);
    if (!size || !rawBounds || typeof rawBounds !== "object") return null;
    const minCol = clamp(Math.floor(Number(rawBounds.minCol) || 0), 0, size - 1);
    const minRow = clamp(Math.floor(Number(rawBounds.minRow) || 0), 0, size - 1);
    const maxCol = clamp(Math.floor(Number(rawBounds.maxCol) || (size - 1)), minCol, size - 1);
    const maxRow = clamp(Math.floor(Number(rawBounds.maxRow) || (size - 1)), minRow, size - 1);
    if (maxCol - minCol + 1 >= size && maxRow - minRow + 1 >= size) return null;
    return { minCol, minRow, maxCol, maxRow };
  },
  normalizeEditorData(editorData, sizeText) {
    if (!editorData || typeof editorData !== "object") return null;

    const fromEditor = Number(editorData.gridSize) || 0;
    const fromText = this.parseGridSizeFromText(sizeText);
    const gridSize = fromEditor > 0 ? fromEditor : fromText;
    if (!gridSize) return null;

    const cellCount = gridSize * gridSize;
    if (!cellCount || cellCount > MAX_EDITOR_CELLS) return null;

    let indexGridPacked = "";
    if (typeof editorData.indexGridPacked === "string" && editorData.indexGridPacked.length >= cellCount * 2) {
      indexGridPacked = editorData.indexGridPacked.slice(0, cellCount * 2);
    } else if (Array.isArray(editorData.indexGrid) && editorData.indexGrid.length >= cellCount) {
      const normalized = editorData.indexGrid.slice(0, cellCount).map((item) => {
        const idx = Number(item);
        if (!Number.isFinite(idx)) return 0;
        if (idx < -1) return -1;
        return idx >= EDITOR_PALETTE.length ? 0 : idx;
      });
      indexGridPacked = packIndexGrid(normalized, EDITOR_MAX_INDEX);
    }
    if (!indexGridPacked || indexGridPacked.length < cellCount * 2) return null;

    const usedColorIndexes = Array.isArray(editorData.usedColorIndexes)
      ? [...new Set(editorData.usedColorIndexes
        .map((item) => Number(item))
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < EDITOR_PALETTE.length))]
      : [];
    const normalizedVersion = Math.max(1, Number(editorData.version) || 1);
    const userEdited = Boolean(editorData.userEdited);

    return {
      version: normalizedVersion,
      gridSize,
      indexGridPacked,
      usedColorIndexes: usedColorIndexes.length
        ? usedColorIndexes
        : [],
      backgroundHex: editorData.backgroundHex || DEFAULT_EDITOR_BG,
      userEdited,
      paletteVersion: typeof editorData.paletteVersion === "string" ? editorData.paletteVersion : "",
      visibleBounds: this.normalizeVisibleBoundsForEditor(editorData.visibleBounds, gridSize)
    };
  },
  normalizeWork(work, index = 0) {
    const now = Date.now();
    const normalizeFailReason = (reason) => {
      const text = String(reason || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      return text.length > 64 ? `${text.slice(0, 64)}...` : text;
    };
    return {
      id: work.id || `w-${Date.now()}-${index}`,
      title: work.title || "AI生成拼豆作品",
      date: work.date || formatGridDate(),
      createdAt: Number(work.createdAt) || (now - index * 1000),
      updatedAt: Number(work.updatedAt) || Number(work.createdAt) || (now - index * 1000),
      previewUpdatedAt: Number(work.previewUpdatedAt) || 0,
      size: work.size || "52x52",
      style: work.style || "精致像素",
      status: work.status || "已完成",
      isGenerating: Boolean(work.isGenerating),
      isFailed: Boolean(work.isFailed),
      failReason: normalizeFailReason(work && work.failReason),
      views: Number(work.views) || 0,
      saves: Number(work.saves) || 0,
      clones: Number(work.clones) || 0,
      earnCoin: Number(work.earnCoin) || 0,
      previewTones: {
        origin: (work.previewTones && work.previewTones.origin) || "origin-a",
        ai: (work.previewTones && work.previewTones.ai) || "ai-a",
        grid: (work.previewTones && work.previewTones.grid) || "grid-a"
      },
      previewImages: {
        origin: (work.previewImages && work.previewImages.origin) || "",
        ai: (work.previewImages && work.previewImages.ai) || "",
        grid: (work.previewImages && work.previewImages.grid) || ""
      },
      beadEstimate: work && work.beadEstimate
        ? {
          total: Number(work.beadEstimate.total) || 0,
          colorUsed: Number(work.beadEstimate.colorUsed) || 0
        }
        : null,
      editorData: this.normalizeEditorData(work && work.editorData, work && work.size)
    };
  },
  parseSizePairFromText(sizeText) {
    const matched = String(sizeText || "").match(/(\d+)\s*[x×*]\s*(\d+)/i);
    if (!matched) return null;
    const width = Number(matched[1]) || 0;
    const height = Number(matched[2]) || 0;
    if (!width || !height) return null;
    return { width, height };
  },
  normalizeWorkLibrary(workLibrary) {
    const source = Array.isArray(workLibrary) ? workLibrary : [];
    const idCounter = Object.create(null);
    return source.map((item, index) => {
      const normalized = this.normalizeWork(item, index);
      const baseId = String(normalized.id || `w-${Date.now()}-${index}`);
      const count = (idCounter[baseId] || 0) + 1;
      idCounter[baseId] = count;
      if (count > 1) {
        normalized.id = `${baseId}-${count}`;
      } else {
        normalized.id = baseId;
      }
      return normalized;
    });
  },
  serializeWork(work, index = 0) {
    const normalized = this.normalizeWork(work, index);
    return {
      id: normalized.id,
      title: normalized.title,
      date: normalized.date,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      previewUpdatedAt: normalized.previewUpdatedAt,
      size: normalized.size,
      style: normalized.style,
      status: normalized.status,
      isGenerating: normalized.isGenerating,
      isFailed: normalized.isFailed,
      failReason: normalized.failReason,
      views: normalized.views,
      saves: normalized.saves,
      clones: normalized.clones,
      earnCoin: normalized.earnCoin,
      previewTones: normalized.previewTones,
      previewImages: normalized.previewImages,
      beadEstimate: normalized.beadEstimate,
      editorData: normalized.editorData
    };
  },
  getRuntimeWorkCache() {
    const app = getApp && getApp();
    if (!app || !app.globalData) return [];
    const cache = app.globalData.createWorkLibraryCache;
    return Array.isArray(cache) ? cache : [];
  },
  setRuntimeWorkCache(list) {
    const app = getApp && getApp();
    if (!app || !app.globalData) return;
    app.globalData.createWorkLibraryCache = Array.isArray(list) ? list : [];
  },
  loadWorkLibrary() {
    const runtimeCache = this.getRuntimeWorkCache();
    if (Array.isArray(runtimeCache) && runtimeCache.length) {
      const normalizedRuntime = runtimeCache.map((item, index) => this.normalizeWork(item, index));
      this.applyWorkLibrary(normalizedRuntime);
      return;
    }

    let cached = null;
    try {
      cached = wx.getStorageSync(STORAGE_KEY);
      if (!Array.isArray(cached) || cached.length === 0) {
        const backup = wx.getStorageSync(BACKUP_STORAGE_KEY);
        if (Array.isArray(backup) && backup.length) {
          cached = backup;
        }
      }
      if ((!Array.isArray(cached) || cached.length === 0) && LEGACY_STORAGE_KEY) {
        const legacy = wx.getStorageSync(LEGACY_STORAGE_KEY);
        if (Array.isArray(legacy) && legacy.length) {
          cached = legacy;
        }
      }
      if (Array.isArray(cached) && cached.length) {
        const normalized = cached.map((item, index) => this.normalizeWork(item, index));
        this.applyWorkLibrary(normalized);
        this.migrateTemporaryPreviewImages(normalized);
        wx.setStorageSync(STORAGE_SEEDED_KEY, true);
        return;
      }
    } catch (error) {
      console.warn("load work library failed", error);
    }

    const hasSeeded = Boolean(wx.getStorageSync(STORAGE_SEEDED_KEY));
    if (!hasSeeded) {
      const baseTime = Date.now();
      const fallback = DEMO_WORK_LIBRARY.map((item, index) => this.normalizeWork({
        ...item,
        createdAt: baseTime - (index + 1) * 3600 * 1000
      }, index));
      this.applyWorkLibrary(fallback);
      this.migrateTemporaryPreviewImages(fallback);
      wx.setStorageSync(STORAGE_SEEDED_KEY, true);
      return;
    }

    this.applyWorkLibrary([]);
  },
  persistWorkLibrary(list) {
    const source = Array.isArray(list) ? list : [];
    const safeList = source
      .map((item, index) => this.serializeWork(item, index))
      .slice(0, MAX_STORED_WORKS);
    const compactList = safeList.map((item, index) => {
      if (!item || !item.editorData) return item;
      if (index < MAX_EDITABLE_WORKS) return item;
      return {
        ...item,
        editorData: null
      };
    });
    this.setRuntimeWorkCache(compactList);

    try {
      wx.setStorageSync(STORAGE_KEY, compactList);
      wx.setStorageSync(BACKUP_STORAGE_KEY, compactList);
      wx.setStorageSync(STORAGE_SEEDED_KEY, true);
    } catch (error) {
      try {
        wx.setStorageSync(STORAGE_KEY, compactList.slice(0, MAX_STORED_WORKS));
        wx.setStorageSync(BACKUP_STORAGE_KEY, compactList.slice(0, MAX_STORED_WORKS));
        wx.setStorageSync(STORAGE_SEEDED_KEY, true);
      } catch (finalError) {
        console.warn("persist work library failed", finalError);
      }
    }
  },
  sortWorkLibrary(workLibrary) {
    const source = Array.isArray(workLibrary) ? workLibrary : this.data.workLibrary;
    return [...source].sort((a, b) => {
      const timeDiff = (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      if (timeDiff !== 0) return timeDiff;
      const idA = String(a && a.id ? a.id : "");
      const idB = String(b && b.id ? b.id : "");
      if (idA === idB) return 0;
      return idA < idB ? 1 : -1;
    });
  },
  computeDisplayWorks(workLibrary) {
    const sorted = this.sortWorkLibrary(workLibrary);
    return sorted.map((item, index) => ({
      ...item,
      isBlankCanvasStyle: String(item && item.style || "") === BLANK_CANVAS_STYLE,
      previewDisplayImages: {
        origin: String(item && item.style || "") === BLANK_CANVAS_STYLE
          ? ""
          : this.resolveDisplayPreviewPath(item && item.id, "origin", item && item.previewImages && item.previewImages.origin),
        ai: String(item && item.style || "") === BLANK_CANVAS_STYLE
          ? ""
          : this.resolveDisplayPreviewPath(item && item.id, "ai", item && item.previewImages && item.previewImages.ai),
        grid: this.resolveDisplayPreviewPath(item && item.id, "grid", item && item.previewImages && item.previewImages.grid)
      },
      renderKey: `${item && item.id ? item.id : "work"}-${Number(item && item.createdAt) || 0}-${index}-${this.getWorkPreviewNonce(item && item.id)}`
    }));
  },
  buildPreviewStateKey(workId, viewType) {
    const safeWorkId = String(workId || "");
    const safeType = String(viewType || "");
    if (!safeWorkId || !safeType) return "";
    return `${safeWorkId}:${safeType}`;
  },
  resolveDisplayPreviewPath(workId, viewType, sourcePath) {
    const safePath = typeof sourcePath === "string" ? sourcePath : "";
    if (!safePath) return "";
    const key = this.buildPreviewStateKey(workId, viewType);
    if (!key) return safePath;
    return this.previewHiddenMap && this.previewHiddenMap[key] ? "" : safePath;
  },
  getWorkPreviewNonce(workId) {
    const id = String(workId || "");
    if (!id) return 0;
    const origin = Number(this.previewRetryNonce[this.buildPreviewStateKey(id, "origin")]) || 0;
    const ai = Number(this.previewRetryNonce[this.buildPreviewStateKey(id, "ai")]) || 0;
    const grid = Number(this.previewRetryNonce[this.buildPreviewStateKey(id, "grid")]) || 0;
    return origin + ai + grid;
  },
  clearPreviewRetryTimers() {
    const timers = this.previewRetryTimers || {};
    Object.keys(timers).forEach((key) => {
      if (timers[key]) clearTimeout(timers[key]);
      delete timers[key];
    });
  },
  syncPreviewRuntimeState(workLibrary) {
    const source = Array.isArray(workLibrary) ? workLibrary : [];
    const nextSnapshot = Object.create(null);
    source.forEach((work) => {
      if (!work || !work.id) return;
      ["origin", "ai", "grid"].forEach((viewType) => {
        const key = this.buildPreviewStateKey(work.id, viewType);
        if (!key) return;
        const path = String(work.previewImages && work.previewImages[viewType] || "");
        nextSnapshot[key] = path;
        const prevPath = this.previewPathSnapshot && this.previewPathSnapshot[key] ? this.previewPathSnapshot[key] : "";
        if (path !== prevPath) {
          this.previewErrorCount[key] = 0;
          this.previewHiddenMap[key] = false;
        }
      });
    });
    const allKeys = new Set([
      ...Object.keys(this.previewPathSnapshot || {}),
      ...Object.keys(this.previewRetryTimers || {}),
      ...Object.keys(this.previewErrorCount || {}),
      ...Object.keys(this.previewRetryNonce || {}),
      ...Object.keys(this.previewHiddenMap || {})
    ]);
    allKeys.forEach((key) => {
      if (key in nextSnapshot) return;
      if (this.previewRetryTimers && this.previewRetryTimers[key]) {
        clearTimeout(this.previewRetryTimers[key]);
        delete this.previewRetryTimers[key];
      }
      delete this.previewErrorCount[key];
      delete this.previewRetryNonce[key];
      delete this.previewHiddenMap[key];
    });
    this.previewPathSnapshot = nextSnapshot;
  },
  syncSummary(workLibrary) {
    const source = Array.isArray(workLibrary) ? workLibrary : this.data.workLibrary;
    const cloneCount = source.reduce((sum, item) => sum + (item.clones || 0), 0);
    this.setData({
      totalCloneCount: cloneCount
    });
  },
  refreshDisplayWorks(workLibrary) {
    this.setData({
      displayWorks: this.computeDisplayWorks(workLibrary)
    });
  },
  unpackWorkIndexGrid(work) {
    const editorData = work && work.editorData && typeof work.editorData === "object" ? work.editorData : null;
    const gridSize = Number(editorData && editorData.gridSize) || this.parseGridSizeFromText(work && work.size);
    const total = gridSize * gridSize;
    if (!gridSize || !total) return null;
    const packed = editorData && typeof editorData.indexGridPacked === "string"
      ? editorData.indexGridPacked
      : "";
    if (!packed || packed.length < total * 2) return null;
    const indexGrid = unpackIndexGrid(packed, total, EDITOR_MAX_INDEX);
    if (!Array.isArray(indexGrid) || indexGrid.length < total) return null;
    return {
      gridSize,
      indexGrid: indexGrid.slice(0, total)
    };
  },
  resolveBackgroundIndexForWork(work) {
    const editorData = work && work.editorData && typeof work.editorData === "object" ? work.editorData : null;
    const backgroundHex = String((editorData && editorData.backgroundHex) || DEFAULT_EDITOR_BG).toUpperCase();
    const direct = PALETTE_INDEX_BY_HEX[backgroundHex];
    if (Number.isFinite(direct) && direct >= 0) return direct;
    return DEFAULT_EDITOR_BG_INDEX;
  },
  computePreviewBoundsForWork(work, indexGrid, gridSize) {
    const size = Math.max(1, Number(gridSize) || 0);
    if (!size || !Array.isArray(indexGrid) || indexGrid.length < size * size) {
      return { minCol: 0, minRow: 0, maxCol: size - 1, maxRow: size - 1 };
    }
    const backgroundIndex = this.resolveBackgroundIndexForWork(work);
    let minCol = size;
    let minRow = size;
    let maxCol = -1;
    let maxRow = -1;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const value = indexGrid[row * size + col];
        const isBackground = !Number.isFinite(value) || value < 0 || value === backgroundIndex;
        if (isBackground) continue;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }
    if (maxCol < minCol || maxRow < minRow) {
      const fallback = this.parseSizePairFromText(work && work.size);
      if (fallback && fallback.width && fallback.height && fallback.width <= size && fallback.height <= size) {
        const offsetX = Math.max(0, Math.floor((size - fallback.width) / 2));
        const offsetY = Math.max(0, Math.floor((size - fallback.height) / 2));
        return {
          minCol: offsetX,
          minRow: offsetY,
          maxCol: Math.min(size - 1, offsetX + fallback.width - 1),
          maxRow: Math.min(size - 1, offsetY + fallback.height - 1)
        };
      }
      return { minCol: 0, minRow: 0, maxCol: size - 1, maxRow: size - 1 };
    }
    const margin = String(work && work.style || "") === BLANK_CANVAS_STYLE ? 1 : 0;
    return {
      minCol: Math.max(0, minCol - margin),
      minRow: Math.max(0, minRow - margin),
      maxCol: Math.min(size - 1, maxCol + margin),
      maxRow: Math.min(size - 1, maxRow + margin)
    };
  },
  buildHexGridByBounds(indexGrid, gridSize, bounds) {
    const width = Math.max(1, bounds.maxCol - bounds.minCol + 1);
    const height = Math.max(1, bounds.maxRow - bounds.minRow + 1);
    const hexGrid = new Array(width * height);
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const srcIndex = (bounds.minRow + row) * gridSize + (bounds.minCol + col);
        const colorIndex = Number(indexGrid[srcIndex]);
        const hex = Number.isFinite(colorIndex) && colorIndex >= 0 && colorIndex < PALETTE_HEX_BY_INDEX.length
          ? PALETTE_HEX_BY_INDEX[colorIndex]
          : DEFAULT_EDITOR_BG;
        hexGrid[row * width + col] = hex || DEFAULT_EDITOR_BG;
      }
    }
    return { hexGrid, width, height };
  },
  async buildWorkGridPreviewImage(work) {
    const unpacked = this.unpackWorkIndexGrid(work);
    if (!unpacked) return "";
    const bounds = this.computePreviewBoundsForWork(work, unpacked.indexGrid, unpacked.gridSize);
    const rendered = this.buildHexGridByBounds(unpacked.indexGrid, unpacked.gridSize, bounds);
    const tempPath = await this.renderPatternImage(rendered.hexGrid, rendered.width, rendered.height, false);
    return this.ensurePersistentImagePath(tempPath, `${work && work.id ? work.id : "work"}_grid_auto`);
  },
  async ensureWorkPreviews() {
    const source = Array.isArray(this.data.workLibrary) ? this.data.workLibrary : [];
    const targets = source.filter((work) => work && work.editorData && String(work.style || "") === BLANK_CANVAS_STYLE);
    if (!targets.length) return;
    const nextList = source.slice();
    let changed = false;
    for (let i = 0; i < targets.length; i += 1) {
      const work = targets[i];
      try {
        const previewPath = await this.buildWorkGridPreviewImage(work);
        if (!previewPath) continue;
        const targetIndex = nextList.findIndex((item) => item && item.id === work.id);
        if (targetIndex === -1) continue;
        const currentPreview = String(nextList[targetIndex].previewImages && nextList[targetIndex].previewImages.grid || "");
        const lastPreviewAt = Number(nextList[targetIndex].previewUpdatedAt) || 0;
        const lastEditAt = Number(nextList[targetIndex].updatedAt) || 0;
        if (currentPreview && lastPreviewAt >= lastEditAt) continue;
        nextList[targetIndex] = {
          ...nextList[targetIndex],
          previewUpdatedAt: lastEditAt || Date.now(),
          previewImages: {
            ...(nextList[targetIndex].previewImages || {}),
            grid: previewPath,
            origin: "",
            ai: ""
          }
        };
        changed = true;
      } catch (error) {
        console.warn("ensure blank canvas preview failed", error);
      }
    }
    if (changed) {
      this.applyWorkLibrary(nextList);
    }
  },
  applyWorkLibrary(workLibrary) {
    const normalized = this.normalizeWorkLibrary(workLibrary);
    const sortedLibrary = this.sortWorkLibrary(normalized);
    this.syncPreviewRuntimeState(sortedLibrary);
    this.setData({
      workLibrary: sortedLibrary,
      displayWorks: this.computeDisplayWorks(sortedLibrary),
      totalCloneCount: sortedLibrary.reduce((sum, item) => sum + (item.clones || 0), 0)
    });
    this.persistWorkLibrary(sortedLibrary);
  },
  setDataAsync(payload) {
    return new Promise((resolve) => {
      this.setData(payload, resolve);
    });
  },
  waitAsync(ms = 16) {
    const delay = Math.max(0, Number(ms) || 0);
    return new Promise((resolve) => setTimeout(resolve, delay));
  },
  async syncCanvasSize(payload) {
    await this.setDataAsync(payload);
    await new Promise((resolve) => {
      if (typeof wx.nextTick === "function") {
        wx.nextTick(resolve);
        return;
      }
      setTimeout(resolve, 0);
    });
    // Real-device canvas layout can lag behind setData callbacks; wait one frame.
    await this.waitAsync(24);
  },
  updateWorkLibrary(id, updater) {
    const source = Array.isArray(this.data.workLibrary) ? this.data.workLibrary : [];
    const workLibrary = source.map((work) => (work.id === id ? updater(work) : work));
    this.applyWorkLibrary(workLibrary);
  },
  prependWork(work) {
    const next = [work, ...this.data.workLibrary];
    this.applyWorkLibrary(next);
  },
  openAiGenerateModal() {
    this.resetUploadModal();
    this.setData({
      showUploadModal: true
    });
  },
  buildBlankCanvasName() {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return this.ensureUniqueWorkName(`空白画布-${month}${day}`);
  },
  buildBlankCanvasWorkRecord(workName) {
    const now = Date.now();
    const gridSize = DEFAULT_BLANK_CANVAS_EDGE;
    const totalCells = gridSize * gridSize;
    const blankIndexGrid = new Array(totalCells).fill(DEFAULT_EDITOR_BG_INDEX);
    return {
      id: `w-${now}`,
      title: workName || this.buildBlankCanvasName(),
      date: "刚刚",
      createdAt: now,
      updatedAt: now,
      previewUpdatedAt: 0,
      size: `${gridSize}x${gridSize}`,
      style: BLANK_CANVAS_STYLE,
      status: "编辑中",
      isGenerating: false,
      isFailed: false,
      failReason: "",
      views: 0,
      saves: 0,
      clones: 0,
      earnCoin: 0,
      previewTones: {
        origin: "origin-a",
        ai: "ai-a",
        grid: "grid-a"
      },
      previewImages: {
        origin: "",
        ai: "",
        grid: ""
      },
      beadEstimate: {
        total: totalCells,
        colorUsed: 0
      },
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize,
        indexGridPacked: packIndexGrid(blankIndexGrid, EDITOR_MAX_INDEX),
        usedColorIndexes: [],
        backgroundHex: DEFAULT_EDITOR_BG,
        userEdited: false,
        paletteVersion: "mard221"
      }
    };
  },
  handleCreateBlankCanvas() {
    const work = this.buildBlankCanvasWorkRecord();
    this.prependWork(work);
    wx.navigateTo({
      url: `/pages/editor/index?workId=${work.id}&name=${encodeURIComponent(work.title)}`
    });
  },
  handleFabTap() {
    if (this.data.isConverting) {
      wx.showToast({ title: "当前有任务正在转换", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: ["空白画布", "AI生成图纸"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.handleCreateBlankCanvas();
          return;
        }
        if (res.tapIndex === 1) {
          this.openAiGenerateModal();
        }
      }
    });
  },
  resetUploadModal() {
    this.setData({
      uploadImagePath: "",
      uploadImageName: "",
      uploadImageSizeText: "",
      uploadPreviewError: false,
      namingDraft: "",
      namingError: "",
      selectedCostMode: "standard",
      selectedStyleMode: STYLE_MODE_FINE,
      selectedMaxEdge: "52",
      customMaxEdge: "",
      costHintText: "转换一次花费1拼豆币，当前拼豆币：12",
      styleHintText: "保持当前精致像素算法，细节更稳定。"
    });
  },
  buildSuggestedWorkName(fileName) {
    const source = (fileName || "").replace(/\.[^.]+$/, "").trim();
    let cleaned = source
      .replace(/^(IMG|DSC|PXL|MMEXPORT|WX_CAMERA|SCREENSHOT|PHOTO|WECHAT)[-_ ]*/i, "")
      .replace(/[a-f0-9]{12,}/ig, "")
      .replace(/\d{10,}/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    cleaned = cleaned.replace(/[^\u4e00-\u9fa5a-zA-Z0-9 ]/g, "").trim();
    if (cleaned.length > 12) cleaned = cleaned.slice(0, 12);
    if (cleaned.length >= 2) return cleaned;

    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `拼豆作品-${month}${day}`;
  },
  normalizeNameInput(name) {
    const safe = (name || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!safe) return "";
    return safe.length > 20 ? safe.slice(0, 20) : safe;
  },
  ensureUniqueWorkName(baseName, excludeId = "") {
    const existing = new Set(
      this.data.workLibrary
        .filter((item) => item && item.id !== excludeId)
        .map((item) => (item.title || "").trim())
        .filter(Boolean)
    );
    if (!existing.has(baseName)) return baseName;
    let seq = 2;
    while (existing.has(`${baseName}-${seq}`)) {
      seq += 1;
    }
    return `${baseName}-${seq}`;
  },
  handleRenameWork(event) {
    const workId = event.currentTarget.dataset.id;
    if (!workId) return;
    const work = this.data.workLibrary.find((item) => item && item.id === workId);
    if (!work) return;

    wx.showModal({
      title: "修改作品名称",
      content: work.title || "",
      editable: true,
      placeholderText: "请输入2-20字作品名",
      confirmText: "保存",
      success: (res) => {
        if (!res.confirm) return;
        const normalized = this.normalizeNameInput(res.content || "");
        if (!normalized || normalized.length < 2) {
          wx.showToast({
            title: "请输入2-20字作品名",
            icon: "none"
          });
          return;
        }
        const finalName = this.ensureUniqueWorkName(normalized, workId);
        this.updateWorkLibrary(workId, (item) => ({
          ...item,
          title: finalName
        }));
        if (this.data.showWorkPreviewModal && this.data.previewWorkTitle === work.title) {
          this.setData({ previewWorkTitle: finalName });
        }
        wx.showToast({
          title: "名称已更新",
          icon: "none"
        });
      }
    });
  },
  handleNamingDraftInput(event) {
    this.setData({
      namingDraft: event.detail.value || "",
      namingError: ""
    });
  },
  handleCloseNamingModal() {
    if (this.data.isConverting) return;
    this.setData({
      showNamingModal: false,
      namingError: ""
    });
  },
  async handleConfirmNaming() {
    if (this.data.isConverting) return;
    const normalized = this.normalizeNameInput(this.data.namingDraft);
    if (!normalized || normalized.length < 2) {
      this.setData({ namingError: "请输入2-20字作品名，便于后续管理和搜索。" });
      return;
    }

    const finalName = this.ensureUniqueWorkName(normalized);
    if (finalName !== normalized) {
      wx.showToast({
        title: `名称已改为${finalName}`,
        icon: "none"
      });
    }
    await this.setDataAsync({
      showNamingModal: false,
      namingError: ""
    });
    this.executeAiConvert(finalName);
  },
  handleShareWork(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    this.updateWorkLibrary(id, (work) => ({
      ...work,
      views: work.views + 1
    }));
    wx.showToast({
      title: "已唤起分享",
      icon: "none"
    });
  },
  handleCloneWork(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    this.updateWorkLibrary(id, (work) => ({
      ...work,
      clones: work.clones + 1
    }));
    wx.showToast({
      title: "已记录同款创作",
      icon: "none"
    });
  },
  handleOpenWorkPreview(event) {
    const workId = event.currentTarget.dataset.workId;
    const viewType = event.currentTarget.dataset.viewType;
    if (!workId || !viewType) return;
    const work = this.data.workLibrary.find((item) => item.id === workId);
    if (!work) return;
    const isQVersionStyle = String(work.style || "").includes("Q版");
    const isBlankCanvasStyle = String(work.style || "") === BLANK_CANVAS_STYLE;

    const labelMap = {
      origin: "原图",
      ai: isQVersionStyle ? "Q版图" : "AI图",
      grid: "图纸"
    };

    const imagePath = this.resolveDisplayPreviewPath(
      workId,
      viewType,
      work.previewImages && work.previewImages[viewType] ? work.previewImages[viewType] : ""
    );
    if (!imagePath && work.isGenerating && viewType !== "origin") {
      wx.showToast({ title: "图纸生成中，请稍候", icon: "none" });
      return;
    }
    if (!imagePath && isBlankCanvasStyle && viewType === "grid") {
      wx.showToast({ title: "图纸预览生成中，请稍候", icon: "none" });
      return;
    }

    const toneMap = work.previewTones || {};
    this.setData({
      showWorkPreviewModal: true,
      previewWorkTitle: work.title,
      previewLabel: labelMap[viewType] || "预览",
      previewTone: toneMap[viewType] || "origin-a",
      previewImagePath: imagePath,
      previewIsPixel: viewType === "grid" || (viewType === "ai" && !isQVersionStyle)
    });
  },
  handleCloseWorkPreview() {
    this.setData({
      showWorkPreviewModal: false,
      previewImagePath: "",
      previewIsPixel: false
    });
  },
  handleOpenColorSheet(event) {
    const workId = event.currentTarget.dataset.id;
    const work = this.data.workLibrary.find((item) => item.id === workId);
    if (!work || work.isGenerating) {
      wx.showToast({ title: "请等待图纸生成完成", icon: "none" });
      return;
    }
    if (work.isFailed) {
      wx.showToast({ title: "该作品暂不可编辑", icon: "none" });
      return;
    }
    const hasPackedEditorData = Boolean(work.editorData && work.editorData.indexGridPacked);
    if (!(work.previewImages && work.previewImages.grid) && !hasPackedEditorData) {
      wx.showToast({ title: "该作品暂不可编辑", icon: "none" });
      return;
    }
    const hasPreviewForRebuild = Boolean(
      work.previewImages
      && (work.previewImages.ai || work.previewImages.grid || work.previewImages.origin)
    );
    if (!hasPackedEditorData && !hasPreviewForRebuild) {
      wx.showToast({ title: "该作品编辑数据已归档，请重新生成", icon: "none" });
      return;
    }
    const name = work ? encodeURIComponent(work.title) : "";
    wx.showLoading({
      title: "进入编辑器...",
      mask: true
    });
    wx.navigateTo({
      url: `/pages/editor/index?workId=${workId || ""}&name=${name}`,
      fail: () => {
        wx.hideLoading();
      },
      complete: () => {
        setTimeout(() => wx.hideLoading(), 80);
      }
    });
  },
  handleDeleteWork(event) {
    const workId = event.currentTarget.dataset.id;
    if (!workId) return;
    const work = this.data.workLibrary.find((item) => item.id === workId);
    if (!work) return;
    if (work.isGenerating) {
      wx.showToast({ title: "转换中作品暂不可删除", icon: "none" });
      return;
    }
    wx.showModal({
      title: "删除作品",
      content: "删除后不可恢复，确认删除吗？",
      confirmColor: "#FF3B5C",
      success: async (res) => {
        if (!res.confirm) return;
        await this.cleanupWorkPreviewFiles(work);
        const workLibrary = this.data.workLibrary.filter((item) => item.id !== workId);
        this.applyWorkLibrary(workLibrary);
        if (this.data.showWorkPreviewModal && this.data.previewWorkTitle === work.title) {
          this.handleCloseWorkPreview();
        }
        wx.showToast({ title: "已删除", icon: "none" });
      }
    });
  },
  formatFileSize(size) {
    if (!size || size <= 0) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / 1024 / 102.4) / 10} MB`;
  },
  extractImageSelection(res) {
    const tempFiles = Array.isArray(res && res.tempFiles) ? res.tempFiles : [];
    const firstFile = tempFiles[0] || null;
    const pathFromFiles = firstFile
      ? (firstFile.tempFilePath || firstFile.path || firstFile.tempFileURL || "")
      : "";
    const pathFromList = Array.isArray(res && res.tempFilePaths) ? (res.tempFilePaths[0] || "") : "";
    const pathFromSingle = typeof (res && res.tempFilePath) === "string" ? res.tempFilePath : "";
    const path = pathFromFiles || pathFromList || pathFromSingle;
    const size = firstFile && typeof firstFile.size === "number" ? firstFile.size : 0;
    const name = path ? (path.split("/").pop() || "已选择图片") : "";
    return { path, size, name };
  },
  applySelectedImage(res) {
    const selected = this.extractImageSelection(res);
    if (!selected.path) {
      wx.showToast({ title: "图片读取失败，请重试", icon: "none" });
      return;
    }
    this.setData({
      uploadImagePath: selected.path,
      uploadImageName: selected.name,
      uploadImageSizeText: this.formatFileSize(selected.size),
      uploadPreviewError: false
    });
  },
  chooseImageBySource(sourceType, callback) {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType,
      success: (res) => {
        if (typeof callback === "function") callback(res);
      },
      fail: (error) => {
        if (error && typeof error.errMsg === "string" && error.errMsg.includes("cancel")) return;
        wx.showToast({ title: "上传失败，请重试", icon: "none" });
      },
      complete: () => {
        this.isPickingImage = false;
      }
    });
  },
  openActionSheetAndChoose(callback) {
    this.isPickingImage = true;
    wx.showActionSheet({
      itemList: ["拍摄", "从相册选择"],
      success: (result) => {
        const sourceType = result.tapIndex === 0 ? ["camera"] : ["album"];
        this.chooseImageBySource(sourceType, callback);
      },
      fail: (error) => {
        this.isPickingImage = false;
        if (error && typeof error.errMsg === "string" && error.errMsg.includes("cancel")) return;
        wx.showToast({ title: "无法打开上传选项", icon: "none" });
      }
    });
  },
  handleUploadAreaTap() {
    this.openActionSheetAndChoose((res) => this.applySelectedImage(res));
  },
  handleUploadPreviewError() {
    this.setData({ uploadPreviewError: true });
    wx.showToast({ title: "该图片暂不支持预览", icon: "none" });
  },
  handleWorkPreviewImageError(event) {
    const workId = event.currentTarget.dataset.workId;
    const viewType = event.currentTarget.dataset.viewType;
    if (!workId || !viewType) return;
    const work = (this.data.workLibrary || []).find((item) => item && item.id === workId);
    const imagePath = String(work && work.previewImages && work.previewImages[viewType] || "");
    if (!imagePath) return;

    const key = this.buildPreviewStateKey(workId, viewType);
    if (!key) return;
    const nextErrorCount = (Number(this.previewErrorCount[key]) || 0) + 1;
    this.previewErrorCount[key] = nextErrorCount;

    if (this.previewRetryTimers[key]) {
      clearTimeout(this.previewRetryTimers[key]);
      delete this.previewRetryTimers[key];
    }

    const retryDelay = PREVIEW_RETRY_DELAY_MS * Math.min(3, nextErrorCount);
    const shouldRetry = nextErrorCount <= PREVIEW_ERROR_RETRY_LIMIT;
    if (shouldRetry) {
      this.previewRetryTimers[key] = setTimeout(async () => {
        delete this.previewRetryTimers[key];
        let exists = true;
        try {
          exists = await this.checkLocalImagePathExists(imagePath);
        } catch (error) {
          exists = true;
        }
        if (!exists) {
          this.previewHiddenMap[key] = true;
        } else {
          this.previewHiddenMap[key] = false;
          if (this.isTemporaryPreviewPath(imagePath)) {
            try {
              const persisted = await this.ensurePersistentImagePath(
                imagePath,
                `${workId}_${viewType}_retry`
              );
              if (persisted && persisted !== imagePath) {
                this.updateWorkLibrary(workId, (record) => {
                  if (!record || !record.previewImages) return record;
                  if (record.previewImages[viewType] !== imagePath) return record;
                  return {
                    ...record,
                    previewImages: {
                      ...record.previewImages,
                      [viewType]: persisted
                    }
                  };
                });
                return;
              }
            } catch (error) {
              // ignore and keep retry path
            }
          }
        }
        this.previewRetryNonce[key] = (Number(this.previewRetryNonce[key]) || 0) + 1;
        this.refreshDisplayWorks();
      }, retryDelay);
      return;
    }

    this.previewHiddenMap[key] = true;
    this.previewRetryNonce[key] = (Number(this.previewRetryNonce[key]) || 0) + 1;
    this.refreshDisplayWorks();
  },
  checkLocalImagePathExists(path) {
    const source = typeof path === "string" ? path.trim() : "";
    if (!source) return Promise.resolve(false);
    if (/^https?:\/\//i.test(source)) return Promise.resolve(true);
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.getFileInfo !== "function") return Promise.resolve(true);
    return new Promise((resolve) => {
      fs.getFileInfo({
        filePath: source,
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  },
  isTemporaryPreviewPath(path) {
    const source = typeof path === "string" ? path.trim() : "";
    if (!source) return false;
    if (/^https?:\/\//i.test(source)) return false;
    if (this.isManagedPreviewPath(source)) return false;
    if (source.includes("/usr/")) return false;
    return source.startsWith("wxfile://") || source.includes("/tmp/");
  },
  async migrateTemporaryPreviewImages(workLibrary) {
    if (this.previewMigrationRunning) return;
    const source = Array.isArray(workLibrary) ? workLibrary : [];
    if (!source.length) return;
    this.previewMigrationRunning = true;
    try {
      const migrated = source.map((item) => this.normalizeWork(item));
      let changed = false;
      for (let i = 0; i < migrated.length; i += 1) {
        const work = migrated[i];
        if (!work || !work.previewImages) continue;
        const nextPreviewImages = { ...work.previewImages };
        for (const viewType of ["origin", "ai", "grid"]) {
          const currentPath = String(nextPreviewImages[viewType] || "");
          if (!this.isTemporaryPreviewPath(currentPath)) continue;
          let exists = true;
          try {
            exists = await this.checkLocalImagePathExists(currentPath);
          } catch (error) {
            exists = true;
          }
          if (!exists) {
            nextPreviewImages[viewType] = "";
            changed = true;
            continue;
          }
          const persisted = await this.ensurePersistentImagePath(currentPath, `${work.id || "work"}_${viewType}`);
          if (persisted && persisted !== currentPath) {
            nextPreviewImages[viewType] = persisted;
            changed = true;
          }
        }
        if (changed) {
          migrated[i] = {
            ...work,
            previewImages: nextPreviewImages
          };
        }
      }
      if (changed) {
        this.applyWorkLibrary(migrated);
      }
    } catch (error) {
      console.warn("migrate temporary preview images failed", error);
    } finally {
      this.previewMigrationRunning = false;
    }
  },
  handlePreviewUploadedImage() {
    if (!this.data.uploadImagePath) return;
    wx.previewImage({
      current: this.data.uploadImagePath,
      urls: [this.data.uploadImagePath]
    });
  },
  handleSelectCostMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.selectedCostMode) return;
    const hint = mode === "mini"
      ? "mini 模式免费，适合先快速预览转换效果"
      : "转换一次花费1拼豆币，当前拼豆币：12";
    this.setData({ selectedCostMode: mode, costHintText: hint });
  },
  handleSelectStyleMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.selectedStyleMode) return;
    const hint = mode === STYLE_MODE_FINE
      ? "保持当前精致像素算法，细节更稳定。"
      : "先做Q版重绘，再生成拼豆图纸，适合萌系卡通风。";
    this.setData({ selectedStyleMode: mode, styleHintText: hint });
  },
  getSelectedStyleMode() {
    return this.data.selectedStyleMode === STYLE_MODE_CARTOON
      ? STYLE_MODE_CARTOON
      : STYLE_MODE_FINE;
  },
  getStyleLabel(mode) {
    return STYLE_LABEL_MAP[mode] || STYLE_LABEL_MAP[STYLE_MODE_FINE];
  },
  handleSelectSizeMode(event) {
    // Legacy - no longer used for grid size
  },
  handleCustomGridSizeInput(event) {
    // Legacy - no longer used
  },
  handleSelectMaxEdge(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.selectedMaxEdge) return;
    this.setData({ selectedMaxEdge: mode });
  },
  handleCustomMaxEdgeInput(event) {
    this.setData({ customMaxEdge: event.detail.value || "" });
  },
  resolveMaxEdgeFromSelection() {
    const mode = this.data.selectedMaxEdge;
    if (mode === "custom") {
      const val = parseInt(this.data.customMaxEdge, 10);
      return (Number.isFinite(val) && val >= 10 && val <= 200) ? val : 52;
    }
    const num = parseInt(mode, 10);
    return (Number.isFinite(num) && num >= 10 && num <= 200) ? num : 52;
  },
  getImageInfo(imagePath) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: resolve,
        fail: reject
      });
    });
  },
  drawCanvasAsync(canvasId, painter) {
    return new Promise((resolve) => {
      const ctx = wx.createCanvasContext(canvasId, this);
      painter(ctx);
      ctx.draw(false, resolve);
    });
  },
  canvasGetImageDataAsync(canvasId, width, height) {
    return new Promise((resolve, reject) => {
      wx.canvasGetImageData(
        {
          canvasId,
          x: 0,
          y: 0,
          width,
          height,
          success: resolve,
          fail: reject
        },
        this
      );
    });
  },
  canvasPutImageDataAsync(canvasId, data, width, height) {
    return new Promise((resolve, reject) => {
      wx.canvasPutImageData(
        {
          canvasId,
          data,
          x: 0,
          y: 0,
          width,
          height,
          success: resolve,
          fail: reject
        },
        this
      );
    });
  },
  canvasToTempFileAsync(canvasId, width, height) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath(
        {
          canvasId,
          x: 0,
          y: 0,
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: "png",
          quality: 1,
          success: (res) => {
            const tempPath = res && typeof res.tempFilePath === "string" ? res.tempFilePath : "";
            if (!tempPath) {
              reject(new Error("empty canvas temp file path"));
              return;
            }
            resolve(tempPath);
          },
          fail: reject
        },
        this
      );
    });
  },
  saveFileAsync(tempFilePath) {
    return new Promise((resolve, reject) => {
      wx.saveFile({
        tempFilePath,
        success: (res) => resolve((res && res.savedFilePath) || ""),
        fail: reject
      });
    });
  },
  removeFileAsync(filePath) {
    return new Promise((resolve) => {
      if (!filePath) {
        resolve(false);
        return;
      }
      wx.getFileSystemManager().unlink({
        filePath,
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  },
  isManagedPreviewPath(path) {
    const source = typeof path === "string" ? path : "";
    const userPath = wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : "";
    if (!source || !userPath) return false;
    if (!source.startsWith(`${userPath}/`)) return false;
    const fileName = source.slice(userPath.length + 1);
    return fileName.startsWith(`${PREVIEW_FILE_PREFIX}_`);
  },
  async cleanupWorkPreviewFiles(work) {
    if (!work || !work.previewImages) return;
    const list = [work.previewImages.origin, work.previewImages.ai, work.previewImages.grid]
      .filter((path) => this.isManagedPreviewPath(path));
    if (!list.length) return;
    const unique = [...new Set(list)];
    await Promise.all(unique.map((path) => this.removeFileAsync(path)));
  },
  async ensurePersistentImagePath(path, nameHint = "") {
    const source = typeof path === "string" ? path.trim() : "";
    if (!source) return "";
    if (/^https?:\/\//i.test(source)) return source;
    if (source.includes("/usr/")) return source;
    const cleanHint = String(nameHint || "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 36);
    try {
      const saved = await this.saveFileAsync(source);
      return saved || source;
    } catch (error) {
      const userPath = wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : "";
      if (userPath) {
        const fallbackName = `${PREVIEW_FILE_PREFIX}_${cleanHint || Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const targetPath = `${userPath}/${fallbackName}`;
        try {
          await new Promise((resolve, reject) => {
            wx.getFileSystemManager().copyFile({
              srcPath: source,
              destPath: targetPath,
              success: resolve,
              fail: reject
            });
          });
          return targetPath;
        } catch (copyError) {
          console.warn("persist preview by copy failed", copyError);
        }
      }
      console.warn("persist preview failed", error);
      return source;
    }
  },
  uploadFileAsync(options = {}) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  },
  downloadFileAsync(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: resolve,
        fail: reject
      });
    });
  },
  requestAsync(options = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  },
  readLocalFileBase64Async(filePath) {
    const source = String(filePath || "").trim();
    if (!source) return Promise.resolve("");
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      return Promise.reject(new Error("fs-readFile-unavailable"));
    }
    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath: source,
        encoding: "base64",
        success: (res) => resolve(String(res && res.data || "").trim()),
        fail: reject
      });
    });
  },
  inferImageMimeType(filePath) {
    const source = String(filePath || "").trim().toLowerCase();
    if (/\.(png)(\?|$)/i.test(source)) return "image/png";
    if (/\.(webp)(\?|$)/i.test(source)) return "image/webp";
    if (/\.(gif)(\?|$)/i.test(source)) return "image/gif";
    return "image/jpeg";
  },
  buildQVersionDirectConfig() {
    const app = getApp && getApp();
    const enabled = Boolean(app && app.globalData && app.globalData.qVersionDirectEnabled);
    const apiUrl = String(
      app
      && app.globalData
      && app.globalData.qVersionDirectApiUrl
      || ""
    ).trim();
    const apiKey = String(
      app
      && app.globalData
      && app.globalData.qVersionDirectApiKey
      || ""
    ).trim();
    const model = String(
      app
      && app.globalData
      && app.globalData.qVersionDirectModel
      || ""
    ).trim();
    return {
      enabled: enabled && Boolean(apiUrl) && Boolean(apiKey) && Boolean(model),
      apiUrl,
      apiKey,
      model
    };
  },
  parseUploadResponseData(rawData) {
    if (!rawData) return {};
    if (typeof rawData === "object") return rawData;
    const text = String(rawData || "").trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      return {};
    }
  },
  buildFriendlyStageErrorMessage(error) {
    const detail = String(
      (error && error.message)
      || (error && error.errMsg)
      || ""
    );
    if (/url not in domain list/i.test(detail)) {
      return "开发者工具拦截了本地接口，请在“详情 -> 本地设置”里勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”后重试。";
    }
    if (/ark\.cn-beijing\.volces\.com/i.test(detail) || /request:fail.*domain list/i.test(detail)) {
      return "当前小程序没有放行豆包官方域名，请在微信小程序后台把 https://ark.cn-beijing.volces.com 配到 request 合法域名后重试。";
    }
    if (/uploadFile:fail/i.test(detail) && /127\\.0\\.0\\.1|localhost/i.test(detail)) {
      return "本地 Q 版接口未放行，请在开发者工具本地设置里关闭合法域名校验后重试。";
    }
    return "";
  },
  collectQVersionImageCandidates(payload) {
    const queue = [payload];
    const visited = [];
    const candidates = [];
    const pushValue = (value) => {
      if (!value) return;
      if (typeof value === "string") {
        const source = value.trim();
        if (!source) return;
        if (
          /^https?:\/\//i.test(source)
          || /^data:image\//i.test(source)
          || /^[A-Za-z0-9+/=\s]+$/.test(source)
        ) {
          candidates.push(source);
        }
        return;
      }
      if (value && typeof value === "object") {
        if (visited.includes(value)) return;
        visited.push(value);
        queue.push(value);
      }
    };

    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      if (Array.isArray(current)) {
        current.forEach((item) => pushValue(item));
        continue;
      }
      if (typeof current !== "object") {
        pushValue(current);
        continue;
      }
      [
        "url",
        "imageUrl",
        "image_url",
        "imagePath",
        "outputImagePath",
        "stylizedImagePath",
        "result",
        "b64_json",
        "b64",
        "base64",
        "image_base64",
        "imageBase64"
      ].forEach((key) => {
        if (key in current) pushValue(current[key]);
      });
      Object.keys(current).forEach((key) => {
        const value = current[key];
        if (Array.isArray(value) || (value && typeof value === "object")) {
          pushValue(value);
        }
      });
    }
    return candidates.filter(Boolean);
  },
  isLocalApiConnectionError(error) {
    const detail = String(
      (error && error.message)
      || (error && error.errMsg)
      || ""
    );
    return /ECONNREFUSED|uploadFile:fail|request:fail|timeout/i.test(detail);
  },
  buildQVersionApiConfig() {
    const app = getApp && getApp();
    const base = String(
      app
      && app.globalData
      && (
        app.globalData.qVersionApiBaseUrl
        || app.globalData.pdfExportBaseUrl
        || ""
      )
    ).replace(/\/+$/, "");
    const path = String(
      app
      && app.globalData
      && app.globalData.qVersionApiPath
      || "/api/q-cartoonize"
    ).trim();
    const token = String(
      app
      && app.globalData
      && app.globalData.qVersionApiToken
      || ""
    ).trim();
    const required = Boolean(
      app
      && app.globalData
      && app.globalData.qVersionApiRequired
    );
    const allowLocalFallback = Boolean(
      app
      && app.globalData
      && app.globalData.qVersionAllowLocalFallback
    );
    if (!base) {
      return {
        enabled: false,
        required,
        url: "",
        token,
        allowLocalFallback
      };
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return {
      enabled: true,
      required,
      url: `${base}${normalizedPath}`,
      token,
      allowLocalFallback
    };
  },
  buildQVersionApiCandidates(config = {}) {
    const app = getApp && getApp();
    const urls = [];
    const pushBase = (base) => {
      const normalizedBase = String(base || "").trim().replace(/\/+$/, "");
      if (!normalizedBase) return;
      const normalizedPath = String(config.url || "").replace(/^https?:\/\/[^/]+/i, "");
      const finalUrl = normalizedPath ? `${normalizedBase}${normalizedPath}` : normalizedBase;
      if (!urls.includes(finalUrl)) urls.push(finalUrl);
    };
    const currentUrl = String(config.url || "").trim();
    if (currentUrl) urls.push(currentUrl);
    if (app && app.globalData) {
      pushBase(app.globalData.localApiBaseUrl);
      pushBase(app.globalData.localLanApiBaseUrl);
      pushBase(app.globalData.remoteApiBaseUrl);
      pushBase(app.globalData.pdfExportBaseUrl);
    }
    return urls.filter(Boolean);
  },
  buildQVersionPrompt({ workName, maxEdge }) {
    const safeName = String(workName || "原图主体").slice(0, 24);
    const safeEdge = Math.max(10, Math.min(200, Number(maxEdge) || 52));
    return [
      "请将输入图片重绘为干净、简洁、可爱的Q版插画标准稿。",
      "严格保持原图主体类型不变：如果原图是人物就还是人物，如果原图是玩偶、动物、吉祥物、卡通形象、手办或公仔，就仍然保持原来的主体类型，绝对不要改成人类或其他物种。",
      "严格保留原图的主体轮廓、耳朵、头发、脸型、眼睛、服装、花纹、配饰、颜色分区和主要表情，不要遗漏关键结构，不要新增衣服、饰品或背景元素。",
      "严格保持原图的朝向和视角不变：头部朝向、身体转向、脸部左右方向、俯视或仰视角度、侧脸或正脸关系、眼神方向都必须与原图一致，不能擅自改成更正面的角度。",
      "保持完整构图和主体数量，不要裁掉头部、手部、耳朵、配饰、边缘元素，不要漏主体。",
      "背景必须是纯白色背景，只能是纯白底，不允许保留原图场景、环境色、阴影背景、渐变背景或任何背景装饰。",
      "输出为非像素风的日系Q版插画，五官和结构清晰自然，轮廓清楚但不要夸张粗黑描边，不要在主体外面额外包一圈厚重黑边。",
      "配色尽量贴近原图，颜色干净、平涂感更强，适当减少复杂渐变、杂乱阴影和高频纹理，但不要改变主体本身的固有颜色。",
      "如果原图主体本来就是简化卡通形象，请优先保持原形象设定，只做Q版整理，不要重新设计成别的角色。",
      `作品名：${safeName}，目标边长参考：${safeEdge}。`
    ].join(" ");
  },
  buildQVersionNegativePrompt() {
    return [
      "不要生成像素画",
      "不要8bit风格",
      "不要网格",
      "不要拼豆格子",
      "不要马赛克",
      "不要低清晰度",
      "不要写实照片",
      "不要3D渲染",
      "不要复杂背景",
      "不要多余装饰",
      "不要把玩偶变成人",
      "不要把动物变成人",
      "不要把吉祥物变成人类角色",
      "不要新增服装或改造主体设定",
      "不要漏掉人物",
      "不要改变人物数量",
      "不要改变头部朝向",
      "不要改变身体朝向",
      "不要把侧脸改成正脸",
      "不要把正脸改成侧脸",
      "不要改变左右方向",
      "不要改变眼神方向",
      "不要改变俯视或仰视角度",
      "不要裁切边缘元素",
      "不要模糊轮廓",
      "不要保留原图背景",
      "不要场景背景",
      "不要灰色背景",
      "不要彩色背景",
      "不要渐变背景",
      "不要粗黑描边包边",
      "不要厚重外轮廓黑框"
    ].join("，");
  },
  buildIllustrationEnhancePrompt({ workName, maxEdge }) {
    const safeName = String(workName || "原图主体").slice(0, 24);
    const safeEdge = Math.max(10, Math.min(200, Number(maxEdge) || 52));
    return [
      "请将输入图片整理为适合拼豆图纸生成的萌系手绘标准稿。",
      "严格保留原图主体设定、画风、人物比例、服装、发型、表情、色彩关系和原始构图，不要Q版化，不要把人物画胖，不要压缩头身比例，不要改变原图风格。",
      "去除背景，只保留主体，背景必须是纯白色，不允许保留原图场景、环境色、杂物、阴影背景或渐变背景。",
      "整体要更像基于原图整理的萌萌手绘风，线条柔和清楚，轮廓干净，色彩明快，不要发灰，不要发暗，不要出现大面积重阴影。",
      "适度强化主体外轮廓和关键结构轮廓，让边界更清晰，但不要添加厚重黑框，也不要把轮廓画得过于生硬。",
      "尽量保留原图细节层次，同时减少不利于拼豆的小碎线、杂色噪点和脏污纹理，保持主体轻盈、干净、通透。",
      "保持主体完整，不要裁掉耳朵、头饰、手部、衣角、边缘装饰和关键元素。",
      "输出结果应像基于原图润色后的手绘清稿，而不是新的插画设计稿。",
      `作品名：${safeName}，目标边长参考：${safeEdge}。`
    ].join(" ");
  },
  buildIllustrationEnhanceNegativePrompt() {
    return [
      "不要Q版",
      "不要像素画",
      "不要8bit",
      "不要拼豆格子",
      "不要马赛克",
      "不要改变人物设定",
      "不要新增元素",
      "不要删除关键元素",
      "不要复杂背景",
      "不要灰色背景",
      "不要彩色背景",
      "不要渐变背景",
      "不要厚重黑色外轮廓",
      "不要过暗",
      "不要黑乎乎",
      "不要黑色剪影",
      "不要大面积深色块压暗主体",
      "不要脏污阴影",
      "不要厚重暗部",
      "不要把人物整体压扁或画胖",
      "不要过度锐化",
      "不要过度美化",
      "不要写实重绘"
    ].join("，");
  },
  async analyzeImageVisualProfile(imagePath) {
    const source = String(imagePath || "").trim();
    if (!source) {
      return {
        avgLuminance: 255,
        darkRatio: 0,
        whiteRatio: 1,
        saturatedRatio: 0
      };
    }
    let imageInfo = null;
    try {
      imageInfo = await this.getImageInfo(source);
    } catch (error) {
      return {
        avgLuminance: 255,
        darkRatio: 0,
        whiteRatio: 1,
        saturatedRatio: 0
      };
    }
    const sourceWidth = Math.max(1, Number(imageInfo && imageInfo.width) || 1);
    const sourceHeight = Math.max(1, Number(imageInfo && imageInfo.height) || 1);
    const canvasEdge = clamp(Math.max(sourceWidth, sourceHeight), 96, 160);
    const drawScale = canvasEdge / Math.max(sourceWidth, sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.floor((canvasEdge - drawWidth) / 2);
    const drawY = Math.floor((canvasEdge - drawHeight) / 2);
    try {
      await this.syncCanvasSize({ processCanvasSize: canvasEdge });
      await this.drawCanvasAsync("processCanvas", (ctx) => {
        ctx.setFillStyle("#FFFFFF");
        ctx.fillRect(0, 0, canvasEdge, canvasEdge);
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      });
      const imageData = await this.canvasGetImageDataAsync("processCanvas", canvasEdge, canvasEdge);
      if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
        throw new Error("profile-image-data-missing");
      }
      const pixels = imageData.data;
      const total = canvasEdge * canvasEdge;
      let lumSum = 0;
      let darkCount = 0;
      let whiteCount = 0;
      let saturatedCount = 0;
      for (let i = 0; i < total; i += 1) {
        const offset = i * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lumSum += lum;
        if (lum < 72) darkCount += 1;
        if (lum > 242 && chroma < 20) whiteCount += 1;
        if (chroma > 42) saturatedCount += 1;
      }
      return {
        avgLuminance: lumSum / Math.max(1, total),
        darkRatio: darkCount / Math.max(1, total),
        whiteRatio: whiteCount / Math.max(1, total),
        saturatedRatio: saturatedCount / Math.max(1, total)
      };
    } catch (error) {
      console.warn("analyze image visual profile failed", error);
      return {
        avgLuminance: 255,
        darkRatio: 0,
        whiteRatio: 1,
        saturatedRatio: 0
      };
    }
  },
  shouldRejectIllustrationEnhancement(sourceProfile, enhancedProfile) {
    const sourceLum = Number(sourceProfile && sourceProfile.avgLuminance) || 0;
    const enhancedLum = Number(enhancedProfile && enhancedProfile.avgLuminance) || 0;
    const enhancedDarkRatio = Number(enhancedProfile && enhancedProfile.darkRatio) || 0;
    const enhancedWhiteRatio = Number(enhancedProfile && enhancedProfile.whiteRatio) || 0;
    return (
      (enhancedLum + 22 < sourceLum)
      || enhancedDarkRatio >= 0.34
      || (enhancedWhiteRatio < 0.18 && enhancedLum < 138)
    );
  },
  async classifySourceImageType(sourceImagePath) {
    const source = String(sourceImagePath || "").trim();
    if (!source) return SOURCE_KIND_PHOTO;
    let imageInfo = null;
    try {
      imageInfo = await this.getImageInfo(source);
    } catch (error) {
      return SOURCE_KIND_PHOTO;
    }
    const sourceWidth = Math.max(1, Number(imageInfo && imageInfo.width) || 1);
    const sourceHeight = Math.max(1, Number(imageInfo && imageInfo.height) || 1);
    const canvasEdge = clamp(Math.max(sourceWidth, sourceHeight), 120, 192);
    const drawScale = canvasEdge / Math.max(sourceWidth, sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.floor((canvasEdge - drawWidth) / 2);
    const drawY = Math.floor((canvasEdge - drawHeight) / 2);

    try {
      await this.syncCanvasSize({ processCanvasSize: canvasEdge });
      await this.drawCanvasAsync("processCanvas", (ctx) => {
        ctx.setFillStyle("#FFFFFF");
        ctx.fillRect(0, 0, canvasEdge, canvasEdge);
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      });
      const imageData = await this.canvasGetImageDataAsync("processCanvas", canvasEdge, canvasEdge);
      if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
        return SOURCE_KIND_PHOTO;
      }
      const pixels = imageData.data;
      const total = canvasEdge * canvasEdge;
      let neighborPairs = 0;
      let flatPairs = 0;
      let hardPairs = 0;
      let darkOutlinePixels = 0;
      let saturatedPixels = 0;
      const bins = Object.create(null);

      for (let y = 0; y < canvasEdge; y += 1) {
        for (let x = 0; x < canvasEdge; x += 1) {
          const idx = y * canvasEdge + x;
          const offset = idx * 4;
          const r = pixels[offset];
          const g = pixels[offset + 1];
          const b = pixels[offset + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < 92 && chroma < 120) darkOutlinePixels += 1;
          if (chroma > 42) saturatedPixels += 1;
          bins[`${r >> 5}_${g >> 5}_${b >> 5}`] = 1;

          if (x > 0) {
            const left = offset - 4;
            const diff = Math.abs(r - pixels[left]) + Math.abs(g - pixels[left + 1]) + Math.abs(b - pixels[left + 2]);
            neighborPairs += 1;
            if (diff <= 22) flatPairs += 1;
            if (diff >= 128) hardPairs += 1;
          }
          if (y > 0) {
            const up = offset - canvasEdge * 4;
            const diff = Math.abs(r - pixels[up]) + Math.abs(g - pixels[up + 1]) + Math.abs(b - pixels[up + 2]);
            neighborPairs += 1;
            if (diff <= 22) flatPairs += 1;
            if (diff >= 128) hardPairs += 1;
          }
        }
      }

      const flatRatio = flatPairs / Math.max(1, neighborPairs);
      const hardRatio = hardPairs / Math.max(1, neighborPairs);
      const darkOutlineRatio = darkOutlinePixels / Math.max(1, total);
      const saturatedRatio = saturatedPixels / Math.max(1, total);
      const uniqueRatio = Object.keys(bins).length / Math.max(1, total);
      const illustrationLike = (
        (flatRatio >= 0.64 && uniqueRatio <= 0.016)
        || (flatRatio >= 0.56 && hardRatio >= 0.14 && darkOutlineRatio >= 0.04 && uniqueRatio <= 0.02)
        || (flatRatio >= 0.52 && uniqueRatio <= 0.01 && saturatedRatio >= 0.26 && darkOutlineRatio >= 0.03)
      );
      const cleanIllustrationLike = illustrationLike && (
        (flatRatio >= 0.7 && hardRatio >= 0.12 && uniqueRatio <= 0.012)
        || (flatRatio >= 0.66 && darkOutlineRatio >= 0.035 && saturatedRatio >= 0.22 && uniqueRatio <= 0.014)
      );
      const resolvedKind = cleanIllustrationLike
        ? SOURCE_KIND_CLEAN_ILLUSTRATION
        : (illustrationLike ? SOURCE_KIND_ILLUSTRATION : SOURCE_KIND_PHOTO);

      console.log("[source-kind] classified", {
        kind: resolvedKind,
        flatRatio: Number(flatRatio.toFixed(3)),
        hardRatio: Number(hardRatio.toFixed(3)),
        darkOutlineRatio: Number(darkOutlineRatio.toFixed(3)),
        saturatedRatio: Number(saturatedRatio.toFixed(3)),
        uniqueRatio: Number(uniqueRatio.toFixed(4))
      });

      return resolvedKind;
    } catch (error) {
      console.warn("classify source image type failed", error);
      return SOURCE_KIND_PHOTO;
    }
  },
  async persistBase64ImageCandidate(candidate, nameHint = "") {
    const source = String(candidate || "").trim();
    if (!source) return "";
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.writeFile !== "function") {
      throw new Error("fs-writeFile-unavailable");
    }
    const dataUrlMatch = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const mimeType = dataUrlMatch ? dataUrlMatch[1] : "image/png";
    const base64 = dataUrlMatch ? dataUrlMatch[2] : source.replace(/\s+/g, "");
    const ext = /png/i.test(mimeType) ? "png" : /webp/i.test(mimeType) ? "webp" : "jpg";
    const targetPath = `${wx.env.USER_DATA_PATH}/${nameHint || `qv_direct_${Date.now()}`}.${ext}`;
    await new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: targetPath,
        data: base64,
        encoding: "base64",
        success: resolve,
        fail: reject
      });
    });
    return targetPath;
  },
  async resolveQVersionCandidateToLocal(candidate, nameHint = "") {
    const source = String(candidate || "").trim();
    if (!source) return "";
    if (/^https?:\/\//i.test(source)) {
      return this.resolveRemoteImageToLocal(source, nameHint);
    }
    if (/^data:image\//i.test(source) || /^[A-Za-z0-9+/=\s]+$/.test(source)) {
      return this.persistBase64ImageCandidate(source, nameHint);
    }
    return source;
  },
  async normalizeQVersionToWhiteBackground(imagePath, nameHint = "") {
    const source = String(imagePath || "").trim();
    if (!source) return "";
    let imageInfo = null;
    try {
      imageInfo = await this.getImageInfo(source);
    } catch (error) {
      console.warn("normalize q-version getImageInfo failed", error);
      return source;
    }
    const sourceWidth = Math.max(1, Number(imageInfo && imageInfo.width) || 1);
    const sourceHeight = Math.max(1, Number(imageInfo && imageInfo.height) || 1);
    const canvasEdge = clamp(Math.max(sourceWidth, sourceHeight), 160, 512);
    const drawWidth = Math.max(1, Math.round(sourceWidth * (canvasEdge / Math.max(sourceWidth, sourceHeight))));
    const drawHeight = Math.max(1, Math.round(sourceHeight * (canvasEdge / Math.max(sourceWidth, sourceHeight))));
    const drawX = Math.floor((canvasEdge - drawWidth) / 2);
    const drawY = Math.floor((canvasEdge - drawHeight) / 2);

    try {
      await this.syncCanvasSize({ processCanvasSize: canvasEdge });
      await this.drawCanvasAsync("processCanvas", (ctx) => {
        ctx.setFillStyle("#FFFFFF");
        ctx.fillRect(0, 0, canvasEdge, canvasEdge);
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      });
    } catch (error) {
      console.warn("normalize q-version draw failed", error);
      return source;
    }

    let imageData = null;
    try {
      imageData = await this.canvasGetImageDataAsync("processCanvas", canvasEdge, canvasEdge);
    } catch (error) {
      console.warn("normalize q-version getImageData failed", error);
      return source;
    }
    if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
      return source;
    }

    const foregroundAnalysis = this.detectForegroundRegionFromRawPixels(
      imageData.data,
      canvasEdge,
      canvasEdge
    );
    if (!foregroundAnalysis || !(foregroundAnalysis.backgroundMask instanceof Uint8Array)) {
      return source;
    }

    const whitened = new Uint8ClampedArray(imageData.data);
    const total = canvasEdge * canvasEdge;
    for (let i = 0; i < total; i += 1) {
      if (!foregroundAnalysis.backgroundMask[i]) continue;
      const offset = i * 4;
      whitened[offset] = 255;
      whitened[offset + 1] = 255;
      whitened[offset + 2] = 255;
      whitened[offset + 3] = 255;
    }

    try {
      await this.canvasPutImageDataAsync("processCanvas", whitened, canvasEdge, canvasEdge);
      const tempPath = await this.canvasToTempFileAsync("processCanvas", canvasEdge, canvasEdge);
      return await this.ensurePersistentImagePath(tempPath, nameHint || "qv_white");
    } catch (error) {
      console.warn("normalize q-version persist failed", error);
      return source;
    }
  },
  async createMiniappLocalQVersionImage(sourceImagePath, context = {}) {
    const source = String(sourceImagePath || "").trim();
    if (!source) return "";
    let imageInfo = null;
    try {
      imageInfo = await this.getImageInfo(source);
    } catch (error) {
      console.warn("miniapp local q-version getImageInfo failed", error);
      return source;
    }
    const sourceWidth = Math.max(1, Number(imageInfo && imageInfo.width) || 1);
    const sourceHeight = Math.max(1, Number(imageInfo && imageInfo.height) || 1);
    const canvasEdge = clamp(Math.max(sourceWidth, sourceHeight), 240, 512);
    const drawScale = canvasEdge / Math.max(sourceWidth, sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.floor((canvasEdge - drawWidth) / 2);
    const drawY = Math.floor((canvasEdge - drawHeight) / 2);

    try {
      await this.syncCanvasSize({ processCanvasSize: canvasEdge });
      await this.drawCanvasAsync("processCanvas", (ctx) => {
        ctx.setFillStyle("#FFFFFF");
        ctx.fillRect(0, 0, canvasEdge, canvasEdge);
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      });
      const imageData = await this.canvasGetImageDataAsync("processCanvas", canvasEdge, canvasEdge);
      if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
        return this.normalizeQVersionToWhiteBackground(
          source,
          `${context.workId || "work"}_qv_source_white`
        );
      }

      const foregroundAnalysis = this.detectForegroundRegionFromRawPixels(
        imageData.data,
        canvasEdge,
        canvasEdge
      );
      const enhanced = this.enhanceCartoonPixelClarity(imageData.data, canvasEdge, canvasEdge);
      const output = new Uint8ClampedArray(enhanced);
      const step = 18;
      const total = canvasEdge * canvasEdge;
      for (let i = 0; i < total; i += 1) {
        const offset = i * 4;
        if (foregroundAnalysis && foregroundAnalysis.backgroundMask && foregroundAnalysis.backgroundMask[i]) {
          output[offset] = 255;
          output[offset + 1] = 255;
          output[offset + 2] = 255;
          output[offset + 3] = 255;
          continue;
        }
        const r = output[offset];
        const g = output[offset + 1];
        const b = output[offset + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const quantize = (value) => clamp(Math.round(value / step) * step, 0, 255);
        output[offset] = quantize(r);
        output[offset + 1] = quantize(g);
        output[offset + 2] = quantize(b);
        if (lum < 58) {
          output[offset] = Math.round(output[offset] * 0.82);
          output[offset + 1] = Math.round(output[offset + 1] * 0.82);
          output[offset + 2] = Math.round(output[offset + 2] * 0.82);
        }
        output[offset + 3] = 255;
      }

      await this.canvasPutImageDataAsync("processCanvas", output, canvasEdge, canvasEdge);
      const tempPath = await this.canvasToTempFileAsync("processCanvas", canvasEdge, canvasEdge);
      const persisted = await this.ensurePersistentImagePath(
        tempPath,
        `${context.workId || "work"}_qv_local`
      );
      return this.normalizeQVersionToWhiteBackground(
        persisted || tempPath,
        `${context.workId || "work"}_qv_local_white`
      );
    } catch (error) {
      console.warn("miniapp local q-version fallback degraded to source white background", error);
      return this.normalizeQVersionToWhiteBackground(
        source,
        `${context.workId || "work"}_qv_source_white`
      );
    }
  },
  async resolveRemoteImageToLocal(imagePath, nameHint = "") {
    const source = String(imagePath || "").trim();
    if (!source) return "";
    if (!/^https?:\/\//i.test(source)) return source;
    const downloaded = await this.downloadFileAsync(source);
    if (!downloaded || downloaded.statusCode !== 200 || !downloaded.tempFilePath) {
      throw new Error(`[convert:q-style-download] download failed: ${source}`);
    }
    const persisted = await this.ensurePersistentImagePath(downloaded.tempFilePath, nameHint);
    return persisted || downloaded.tempFilePath;
  },
  async prepareQVersionDirectSourceImage(sourceImagePath, context = {}) {
    const source = await this.resolveRemoteImageToLocal(
      sourceImagePath,
      `${context.workId || "work"}_qv_direct_source`
    );
    if (!source) return "";
    let imageInfo = null;
    try {
      imageInfo = await this.getImageInfo(source);
    } catch (error) {
      return source;
    }
    const sourceWidth = Math.max(1, Number(imageInfo && imageInfo.width) || 1);
    const sourceHeight = Math.max(1, Number(imageInfo && imageInfo.height) || 1);
    const canvasEdge = clamp(Math.max(sourceWidth, sourceHeight), 256, 768);
    const drawScale = canvasEdge / Math.max(sourceWidth, sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.floor((canvasEdge - drawWidth) / 2);
    const drawY = Math.floor((canvasEdge - drawHeight) / 2);
    try {
      await this.syncCanvasSize({ processCanvasSize: canvasEdge });
      await this.drawCanvasAsync("processCanvas", (ctx) => {
        ctx.setFillStyle("#FFFFFF");
        ctx.fillRect(0, 0, canvasEdge, canvasEdge);
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      });
      const tempPath = await this.canvasToTempFileAsync("processCanvas", canvasEdge, canvasEdge);
      return await this.ensurePersistentImagePath(
        tempPath,
        `${context.workId || "work"}_qv_direct_source_prepared`
      );
    } catch (error) {
      console.warn("prepare q-version direct source failed", error);
      return source;
    }
  },
  async requestDirectSeedreamImage(sourceImagePath, options = {}) {
    const directConfig = this.buildQVersionDirectConfig();
    if (!directConfig.enabled) {
      throw new Error("seedream-direct-disabled");
    }
    const context = options.context || {};
    const localSourcePath = await this.prepareQVersionDirectSourceImage(sourceImagePath, context);
    const base64 = await this.readLocalFileBase64Async(localSourcePath);
    if (!base64) {
      throw new Error("seedream-direct-read-source-failed");
    }
    const mimeType = this.inferImageMimeType(localSourcePath);
    const prompt = String(options.prompt || "").trim();
    const negativePrompt = String(options.negativePrompt || "").trim();
    const size = String(options.size || (Number(context.maxEdge || 0) >= 144 ? "4K" : "2K")).trim() || "2K";
    const persistPrefix = String(options.persistPrefix || `${context.workId || "work"}_seedream`).trim();
    const provider = String(options.provider || "doubao-seedream-4.5-direct").trim() || "doubao-seedream-4.5-direct";
    const baseBody = {
      model: directConfig.model,
      prompt,
      image: `data:${mimeType};base64,${base64}`,
      sequential_image_generation: "disabled",
      size,
      stream: false,
      watermark: true
    };
    if (negativePrompt) {
      baseBody.negative_prompt = negativePrompt;
    }
    const formats = ["b64_json", "url"];
    let lastError = null;

    for (let i = 0; i < formats.length; i += 1) {
      const responseFormat = formats[i];
      let response = null;
      try {
        response = await this.requestAsync({
          url: directConfig.apiUrl,
          method: "POST",
          timeout: Q_STYLE_REQUEST_TIMEOUT_MS,
          header: {
            "content-type": "application/json",
            Authorization: `Bearer ${directConfig.apiKey}`
          },
          data: {
            ...baseBody,
            response_format: responseFormat
          }
        });
      } catch (error) {
        lastError = error;
        continue;
      }
      const statusCode = Number(response && response.statusCode) || 0;
      const payload = this.parseUploadResponseData(response && response.data);
      if (statusCode < 200 || statusCode >= 300) {
        lastError = new Error(String(
          payload && (payload.message || payload.error || payload.errMsg || payload.code_msg)
          || `http ${statusCode || "unknown"}`
        ));
        continue;
      }
      const candidates = this.collectQVersionImageCandidates(payload);
      if (!candidates.length) {
        lastError = new Error("seedream-direct-empty-image");
        continue;
      }
      const localPath = await this.resolveQVersionCandidateToLocal(
        candidates[0],
        persistPrefix
      );
      if (!localPath) {
        lastError = new Error("seedream-direct-persist-failed");
        continue;
      }
      const normalizedPath = await this.normalizeQVersionToWhiteBackground(
        localPath,
        `${persistPrefix}_white`
      );
      return {
        imagePath: normalizedPath || localPath,
        usedFallback: false,
        provider,
        prompt,
        negativePrompt
      };
    }

    throw lastError || new Error("seedream-direct-failed");
  },
  async requestQVersionDirectFromSeedream(sourceImagePath, context = {}) {
    return this.requestDirectSeedreamImage(sourceImagePath, {
      context,
      prompt: this.buildQVersionPrompt({
        workName: context.workName || "",
        maxEdge: context.maxEdge
      }),
      negativePrompt: this.buildQVersionNegativePrompt(),
      persistPrefix: `${context.workId || "work"}_qv_direct`,
      provider: "doubao-seedream-4.5-direct"
    });
  },
  async requestIllustrationEnhanceDirectFromSeedream(sourceImagePath, context = {}) {
    return this.requestDirectSeedreamImage(sourceImagePath, {
      context,
      prompt: this.buildIllustrationEnhancePrompt({
        workName: context.workName || "",
        maxEdge: context.maxEdge
      }),
      negativePrompt: this.buildIllustrationEnhanceNegativePrompt(),
      persistPrefix: `${context.workId || "work"}_fine_ill_direct`,
      provider: "doubao-seedream-4.5-illustration-direct"
    });
  },
  async runQVersionStylization(sourceImagePath, context = {}) {
    const config = this.buildQVersionApiConfig();
    const prompt = this.buildQVersionPrompt({
      workName: context.workName || "",
      maxEdge: context.maxEdge
    });
    const negativePrompt = this.buildQVersionNegativePrompt();
    const formData = {
      prompt,
      negative_prompt: negativePrompt,
      negativePrompt,
      workName: context.workName || "",
      maxEdge: String(context.maxEdge || ""),
      allowLocalFallback: config.allowLocalFallback ? "true" : "false",
      style: "q-version",
      mode: "cartoon"
    };
    const header = {};
    if (config.token) {
      header.Authorization = `Bearer ${config.token}`;
    }
    const candidateUrls = this.buildQVersionApiCandidates(config);
    let lastError = null;

    try {
      return await this.requestQVersionDirectFromSeedream(sourceImagePath, context);
    } catch (directError) {
      lastError = directError;
      console.warn("[q-style] direct seedream request failed, fallback to proxy candidates", {
        message: directError && directError.message ? directError.message : "",
        errMsg: directError && directError.errMsg ? directError.errMsg : ""
      });
    }

    for (let i = 0; i < candidateUrls.length; i += 1) {
      const candidateUrl = candidateUrls[i];
      let response = null;
      try {
        response = await this.uploadFileAsync({
          url: candidateUrl,
          filePath: sourceImagePath,
          name: Q_STYLE_UPLOAD_FIELD_NAME,
          timeout: Q_STYLE_REQUEST_TIMEOUT_MS,
          formData,
          header
        });
      } catch (error) {
        lastError = error;
        console.warn("[q-style] upload failed, try next candidate", {
          url: candidateUrl,
          errMsg: error && error.errMsg ? error.errMsg : "",
          message: error && error.message ? error.message : ""
        });
        continue;
      }
      const statusCode = Number(response && response.statusCode) || 0;
      const payload = this.parseUploadResponseData(response && response.data);
      console.log("[q-style] upload response", {
        statusCode,
        payload,
        url: candidateUrl
      });
      if (statusCode < 200 || statusCode >= 300) {
        lastError = new Error(String(
          payload && (payload.message || payload.error || payload.errMsg)
          || `http ${statusCode || "unknown"}`
        ));
        continue;
      }
      const outputPath = String(
        payload && (
          payload.imagePath
          || payload.stylizedImagePath
          || payload.outputImagePath
          || payload.url
          || payload.imageUrl
          || payload.result
        )
        || ""
      ).trim();
      if (!outputPath) {
        lastError = new Error("[convert:q-style] 接口未返回输出图片地址");
        continue;
      }
      const localPath = await this.resolveRemoteImageToLocal(
        outputPath,
        `${context.workId || "work"}_qv`
      );
      if (!localPath) {
        lastError = new Error("[convert:q-style] 输出图片落地失败");
        continue;
      }
      const normalizedPath = await this.normalizeQVersionToWhiteBackground(
        localPath,
        `${context.workId || "work"}_qv_white`
      );
      return {
        imagePath: normalizedPath || localPath,
        usedFallback: Boolean(payload && payload.fallback),
        provider: String(payload && payload.provider || ""),
        prompt,
        negativePrompt
      };
    }

    try {
      const localFallbackPath = await this.createMiniappLocalQVersionImage(sourceImagePath, context);
      return {
        imagePath: localFallbackPath || sourceImagePath,
        usedFallback: true,
        provider: "miniapp-local-cartoonizer",
        prompt,
        negativePrompt
      };
    } catch (localFallbackError) {
      console.error("[q-style] miniapp local fallback failed", {
        error: localFallbackError,
        lastError
      });
    }

    const emergencyPath = await this.normalizeQVersionToWhiteBackground(
      sourceImagePath,
      `${context.workId || "work"}_qv_emergency_white`
    );
    return {
      imagePath: emergencyPath || sourceImagePath,
      usedFallback: true,
      provider: "miniapp-emergency-whitebg",
      prompt,
      negativePrompt
    };
  },
  getHexByIndex(index, fallbackHex = "#FFFFFF") {
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= PALETTE_HEX_BY_INDEX.length) {
      return String(fallbackHex || "#FFFFFF").toUpperCase();
    }
    return PALETTE_HEX_BY_INDEX[idx] || String(fallbackHex || "#FFFFFF").toUpperCase();
  },
  buildRectHexGridFromSquareIndexGrid(indexGrid, squareSize, offsetX, offsetY, width, height, backgroundHex = "#FFFFFF", backgroundIndex = 0) {
    const safeSquare = Math.max(1, Math.floor(Number(squareSize) || 0));
    const safeW = Math.max(1, Math.floor(Number(width) || 0));
    const safeH = Math.max(1, Math.floor(Number(height) || 0));
    const safeOffsetX = Math.floor(Number(offsetX) || 0);
    const safeOffsetY = Math.floor(Number(offsetY) || 0);
    const output = new Array(safeW * safeH).fill(String(backgroundHex || "#FFFFFF").toUpperCase());
    if (!Array.isArray(indexGrid) || indexGrid.length < safeSquare * safeSquare) return output;
    for (let row = 0; row < safeH; row += 1) {
      for (let col = 0; col < safeW; col += 1) {
        const squareCol = safeOffsetX + col;
        const squareRow = safeOffsetY + row;
        if (squareCol < 0 || squareRow < 0 || squareCol >= safeSquare || squareRow >= safeSquare) continue;
        const index = indexGrid[squareRow * safeSquare + squareCol];
        output[row * safeW + col] = this.getHexByIndex(
          index,
          this.getHexByIndex(backgroundIndex, backgroundHex)
        );
      }
    }
    return output;
  },
  async sampleImageToGrid(imagePath, imageInfo, gridSize, maxEdge) {
    const sourceWidth = imageInfo.width || gridSize;
    const sourceHeight = imageInfo.height || gridSize;
    const srcRatio = sourceWidth / sourceHeight;

    // Compute the pattern area within gridSize canvas
    const effectiveMaxEdge = Math.min(maxEdge || gridSize, gridSize);
    let patternWidth, patternHeight;
    if (srcRatio >= 1) {
      // Landscape or square: long edge = effectiveMaxEdge
      patternWidth = effectiveMaxEdge;
      patternHeight = Math.round(effectiveMaxEdge / srcRatio);
    } else {
      // Portrait: long edge = effectiveMaxEdge
      patternHeight = effectiveMaxEdge;
      patternWidth = Math.round(effectiveMaxEdge * srcRatio);
    }
    patternWidth = Math.max(1, Math.min(patternWidth, gridSize));
    patternHeight = Math.max(1, Math.min(patternHeight, gridSize));

    // Center the pattern on the gridSize x gridSize canvas
    const drawX = Math.floor((gridSize - patternWidth) / 2);
    const drawY = Math.floor((gridSize - patternHeight) / 2);

    await this.syncCanvasSize({ processCanvasSize: gridSize });
    await this.drawCanvasAsync("processCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, gridSize, gridSize);
      ctx.drawImage(imagePath, drawX, drawY, patternWidth, patternHeight);
    });

    const imageData = await this.canvasGetImageDataAsync("processCanvas", gridSize, gridSize);
    return {
      imageData,
      sourceRect: {
        drawX,
        drawY,
        drawWidth: patternWidth,
        drawHeight: patternHeight
      }
    };
  },
  async sampleImageToGridWithRetry(imagePath, imageInfo, processingEdge, minEdge) {
    const requested = Math.max(1, Math.floor(Number(processingEdge) || 0));
    const floorEdge = Math.max(1, Math.floor(Number(minEdge) || 0));
    const attempts = [];
    const pushAttempt = (value) => {
      const safe = Math.max(floorEdge, Math.floor(value));
      if (!attempts.includes(safe)) attempts.push(safe);
    };
    pushAttempt(requested);
    pushAttempt(requested * 0.86);
    pushAttempt(requested * 0.74);
    pushAttempt(floorEdge);

    let lastError = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const edge = attempts[i];
      try {
        const result = await this.sampleImageToGrid(imagePath, imageInfo, edge, edge);
        return {
          ...result,
          processingEdge: edge
        };
      } catch (error) {
        lastError = error;
        console.warn("sampleImageToGrid retry failed", {
          attempt: i + 1,
          edge,
          errMsg: error && error.errMsg ? error.errMsg : "",
          message: error && error.message ? error.message : ""
        });
      }
    }
    throw lastError || new Error("sampleImageToGrid failed after retry");
  },
  collectDominantBorderColors(rawPixels, width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const counter = Object.create(null);
    let total = 0;

    const pushOffset = (offset) => {
      const alpha = Number(rawPixels[offset + 3]) || 0;
      if (alpha <= 0) return;
      const r = Number(rawPixels[offset]) || 0;
      const g = Number(rawPixels[offset + 1]) || 0;
      const b = Number(rawPixels[offset + 2]) || 0;
      const key = `${Math.floor(r / 24)}_${Math.floor(g / 24)}_${Math.floor(b / 24)}`;
      const record = counter[key] || {
        count: 0,
        sumR: 0,
        sumG: 0,
        sumB: 0
      };
      record.count += 1;
      record.sumR += r;
      record.sumG += g;
      record.sumB += b;
      counter[key] = record;
      total += 1;
    };

    for (let x = 0; x < safeWidth; x += 1) {
      pushOffset(x * 4);
      pushOffset(((safeHeight - 1) * safeWidth + x) * 4);
    }
    for (let y = 1; y < safeHeight - 1; y += 1) {
      pushOffset((y * safeWidth) * 4);
      pushOffset((y * safeWidth + (safeWidth - 1)) * 4);
    }

    const entries = Object.keys(counter)
      .map((key) => {
        const record = counter[key];
        return {
          count: record.count,
          r: record.sumR / Math.max(1, record.count),
          g: record.sumG / Math.max(1, record.count),
          b: record.sumB / Math.max(1, record.count)
        };
      })
      .sort((a, b) => b.count - a.count);

    if (!entries.length) {
      return {
        colors: [{ r: 255, g: 255, b: 255 }],
        spread: 0
      };
    }

    const picked = [];
    let covered = 0;
    const minCount = Math.max(2, Math.floor(total * 0.035));
    const distanceSq = (a, b) => {
      const dr = a.r - b.r;
      const dg = a.g - b.g;
      const db = a.b - b.b;
      return dr * dr + dg * dg + db * db;
    };

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (picked.length >= 6) break;
      if (picked.length > 0 && entry.count < minCount) break;
      const duplicate = picked.some((item) => distanceSq(item, entry) <= 28 * 28);
      if (duplicate) continue;
      picked.push(entry);
      covered += entry.count;
      if (covered >= total * 0.82) break;
    }

    if (!picked.length) picked.push(entries[0]);

    let spreadWeighted = 0;
    let spreadWeight = 0;
    entries.slice(0, Math.min(16, entries.length)).forEach((entry) => {
      let nearest = Number.POSITIVE_INFINITY;
      picked.forEach((item) => {
        const dr = item.r - entry.r;
        const dg = item.g - entry.g;
        const db = item.b - entry.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < nearest) nearest = dist;
      });
      spreadWeighted += nearest * entry.count;
      spreadWeight += entry.count;
    });

    return {
      colors: picked.map((item) => ({ r: item.r, g: item.g, b: item.b })),
      spread: spreadWeight > 0 ? (spreadWeighted / spreadWeight) : 0
    };
  },
  detectForegroundRegionFromRawPixels(rawPixels, width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const total = safeWidth * safeHeight;
    if (!(rawPixels instanceof Uint8ClampedArray) || rawPixels.length < total * 4) {
      return null;
    }

    const borderModel = this.collectDominantBorderColors(rawPixels, safeWidth, safeHeight);
    const prototypes = Array.isArray(borderModel && borderModel.colors) && borderModel.colors.length
      ? borderModel.colors
      : [{ r: 255, g: 255, b: 255 }];
    const spread = Number(borderModel && borderModel.spread) || 0;
    const prototypeThresholdSq = Math.pow(28 + Math.min(24, spread * 0.65), 2);
    const directLinkThresholdSq = Math.pow(18 + Math.min(18, spread * 0.45), 2);
    const backgroundLinkThresholdSq = Math.pow(30 + Math.min(24, spread * 0.55), 2);
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const nearestPrototypeSq = new Float32Array(total);
    const luminance = new Float32Array(total);

    for (let idx = 0; idx < total; idx += 1) {
      const offset = idx * 4;
      const r = Number(rawPixels[offset]) || 0;
      const g = Number(rawPixels[offset + 1]) || 0;
      const b = Number(rawPixels[offset + 2]) || 0;
      luminance[idx] = toLum(r, g, b);
      let nearest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < prototypes.length; i += 1) {
        const item = prototypes[i];
        const dr = r - item.r;
        const dg = g - item.g;
        const db = b - item.b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < nearest) nearest = dist;
      }
      nearestPrototypeSq[idx] = nearest;
    }

    const isBackgroundSeed = (idx) => nearestPrototypeSq[idx] <= prototypeThresholdSq;
    const colorDistanceSq = (leftIndex, rightIndex) => {
      const leftOffset = leftIndex * 4;
      const rightOffset = rightIndex * 4;
      const dr = rawPixels[leftOffset] - rawPixels[rightOffset];
      const dg = rawPixels[leftOffset + 1] - rawPixels[rightOffset + 1];
      const db = rawPixels[leftOffset + 2] - rawPixels[rightOffset + 2];
      return dr * dr + dg * dg + db * db;
    };
    const visitedBackground = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const trySeed = (x, y) => {
      if (x < 0 || y < 0 || x >= safeWidth || y >= safeHeight) return;
      const idx = y * safeWidth + x;
      if (visitedBackground[idx] || !isBackgroundSeed(idx)) return;
      visitedBackground[idx] = 1;
      queue[tail++] = idx;
    };

    for (let x = 0; x < safeWidth; x += 1) {
      trySeed(x, 0);
      trySeed(x, safeHeight - 1);
    }
    for (let y = 1; y < safeHeight - 1; y += 1) {
      trySeed(0, y);
      trySeed(safeWidth - 1, y);
    }

    while (head < tail) {
      const current = queue[head++];
      const currentNearBorder = nearestPrototypeSq[current] <= prototypeThresholdSq * 1.12;
      const currentLum = luminance[current];
      const x = current % safeWidth;
      const y = Math.floor(current / safeWidth);
      const pushNeighbor = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= safeWidth || ny >= safeHeight) return;
        const next = ny * safeWidth + nx;
        if (visitedBackground[next]) return;
        const linkDistance = colorDistanceSq(current, next);
        const nextNearBorder = nearestPrototypeSq[next] <= prototypeThresholdSq * 1.18;
        const lumDiff = Math.abs(currentLum - luminance[next]);
        const canExpand = (
          (nextNearBorder && linkDistance <= backgroundLinkThresholdSq)
          || (currentNearBorder && linkDistance <= directLinkThresholdSq)
          || (currentNearBorder && nextNearBorder && lumDiff <= 18 && linkDistance <= backgroundLinkThresholdSq * 1.28)
        );
        if (!canExpand) return;
        visitedBackground[next] = 1;
        queue[tail++] = next;
      };
      pushNeighbor(x - 1, y);
      pushNeighbor(x + 1, y);
      pushNeighbor(x, y - 1);
      pushNeighbor(x, y + 1);
    }

    const foregroundMask = new Uint8Array(total);
    const visitedForeground = new Uint8Array(total);
    const componentQueue = new Int32Array(total);
    const minKeepCount = Math.max(4, Math.floor(total * 0.00045));
    let keptCount = 0;
    let minX = safeWidth;
    let minY = safeHeight;
    let maxX = -1;
    let maxY = -1;

    for (let start = 0; start < total; start += 1) {
      if (visitedBackground[start] || visitedForeground[start]) continue;
      let compHead = 0;
      let compTail = 0;
      const pixels = [];
      componentQueue[compTail++] = start;
      visitedForeground[start] = 1;
      let count = 0;
      let compMinX = safeWidth;
      let compMinY = safeHeight;
      let compMaxX = -1;
      let compMaxY = -1;
      let touchesBorder = false;

      while (compHead < compTail) {
        const current = componentQueue[compHead++];
        pixels.push(current);
        count += 1;
        const y = Math.floor(current / safeWidth);
        const x = current - y * safeWidth;
        if (x === 0 || y === 0 || x === safeWidth - 1 || y === safeHeight - 1) touchesBorder = true;
        if (x < compMinX) compMinX = x;
        if (y < compMinY) compMinY = y;
        if (x > compMaxX) compMaxX = x;
        if (y > compMaxY) compMaxY = y;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= safeWidth || ny >= safeHeight) continue;
            const next = ny * safeWidth + nx;
            if (visitedBackground[next] || visitedForeground[next]) continue;
            visitedForeground[next] = 1;
            componentQueue[compTail++] = next;
          }
        }
      }

      const keepComponent = count >= minKeepCount || (!touchesBorder && count >= 3 && (compMaxX > compMinX || compMaxY > compMinY));
      if (!keepComponent) continue;

      keptCount += count;
      if (compMinX < minX) minX = compMinX;
      if (compMinY < minY) minY = compMinY;
      if (compMaxX > maxX) maxX = compMaxX;
      if (compMaxY > maxY) maxY = compMaxY;
      pixels.forEach((idx) => {
        foregroundMask[idx] = 1;
      });
    }

    if (keptCount <= 0 || maxX < minX || maxY < minY) {
      return null;
    }

    const backgroundMask = new Uint8Array(total);
    for (let idx = 0; idx < total; idx += 1) {
      backgroundMask[idx] = foregroundMask[idx] ? 0 : 1;
    }

    return {
      backgroundMask,
      bounds: {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      }
    };
  },
  isNearWhiteHex(hex) {
    const rgb = parseHexRgb(hex);
    const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    const span = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    return luminance >= 236 && span <= 30;
  },
  buildBackgroundHexProfileFromHexGrid(hexGrid, width, height) {
    const profile = {
      set: Object.create(null),
      primaryHex: "#FFFFFF"
    };
    profile.set["#FFFFFF"] = true;
    if (!Array.isArray(hexGrid) || !width || !height || hexGrid.length < width * height) return profile;

    const counter = Object.create(null);
    const push = (hex) => {
      const safeHex = String(hex || "#FFFFFF").toUpperCase();
      counter[safeHex] = (counter[safeHex] || 0) + 1;
      if (this.isNearWhiteHex(safeHex)) {
        profile.set[safeHex] = true;
      }
    };

    for (let x = 0; x < width; x += 1) {
      push(hexGrid[x]);
      push(hexGrid[(height - 1) * width + x]);
    }
    for (let y = 1; y < height - 1; y += 1) {
      push(hexGrid[y * width]);
      push(hexGrid[y * width + (width - 1)]);
    }

    const entries = Object.keys(counter).map((hex) => ({
      hex,
      count: counter[hex]
    })).sort((a, b) => b.count - a.count);
    if (!entries.length) return profile;

    const borderTotal = Math.max(1, width * 2 + Math.max(0, height - 2) * 2);
    const top = entries[0];
    if (top && top.count >= Math.max(8, Math.floor(borderTotal * 0.18))) {
      profile.set[top.hex] = true;
    }
    for (let i = 1; i < entries.length && i < 4; i += 1) {
      const item = entries[i];
      if (!this.isNearWhiteHex(item.hex)) continue;
      if (item.count < Math.max(5, Math.floor(top.count * 0.42))) continue;
      profile.set[item.hex] = true;
    }

    if (profile.set[top.hex]) {
      profile.primaryHex = top.hex;
      return profile;
    }
    if (top && this.isNearWhiteHex(top.hex)) {
      profile.primaryHex = top.hex;
      return profile;
    }
    profile.primaryHex = "#FFFFFF";
    return profile;
  },
  isBackgroundHex(hex, backgroundSet = null) {
    const safeHex = String(hex || "").toUpperCase();
    if (backgroundSet && typeof backgroundSet === "object") {
      return Boolean(backgroundSet[safeHex]);
    }
    return safeHex === "#FFFFFF";
  },
  computeContentBoundsFromHexGrid(hexGrid, width, height, backgroundSet = null) {
    if (!Array.isArray(hexGrid) || !width || !height) return null;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const hex = hexGrid[y * width + x];
        if (this.isBackgroundHex(hex, backgroundSet)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  },
  computePrimaryContentBoundsFromHexGrid(hexGrid, width, height, backgroundSet = null) {
    if (!Array.isArray(hexGrid) || !width || !height || hexGrid.length < width * height) return null;
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let best = null;

    for (let start = 0; start < total; start += 1) {
      if (visited[start]) continue;
      const seedHex = hexGrid[start];
      if (this.isBackgroundHex(seedHex, backgroundSet)) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let count = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      while (head < tail) {
        const current = queue[head++];
        const y = Math.floor(current / width);
        const x = current - y * width;
        const hex = hexGrid[current];
        if (this.isBackgroundHex(hex, backgroundSet)) continue;

        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        if (x > 0) {
          const left = current - 1;
          if (!visited[left] && !this.isBackgroundHex(hexGrid[left], backgroundSet)) {
            visited[left] = 1;
            queue[tail++] = left;
          }
        }
        if (x < width - 1) {
          const right = current + 1;
          if (!visited[right] && !this.isBackgroundHex(hexGrid[right], backgroundSet)) {
            visited[right] = 1;
            queue[tail++] = right;
          }
        }
        if (y > 0) {
          const up = current - width;
          if (!visited[up] && !this.isBackgroundHex(hexGrid[up], backgroundSet)) {
            visited[up] = 1;
            queue[tail++] = up;
          }
        }
        if (y < height - 1) {
          const down = current + width;
          if (!visited[down] && !this.isBackgroundHex(hexGrid[down], backgroundSet)) {
            visited[down] = 1;
            queue[tail++] = down;
          }
        }
      }

      if (!best || count > best.count) {
        best = { count, minX, minY, maxX, maxY };
      }
    }

    if (!best || best.count < Math.max(8, Math.floor(total * 0.0035))) return null;
    return {
      minX: best.minX,
      minY: best.minY,
      maxX: best.maxX,
      maxY: best.maxY,
      width: best.maxX - best.minX + 1,
      height: best.maxY - best.minY + 1
    };
  },
  padContentBounds(bounds, width, height, padding = 0) {
    if (!bounds) return null;
    const pad = Math.max(0, Math.floor(padding));
    const minX = Math.max(0, bounds.minX - pad);
    const minY = Math.max(0, bounds.minY - pad);
    const maxX = Math.min(width - 1, bounds.maxX + pad);
    const maxY = Math.min(height - 1, bounds.maxY + pad);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  },
  extractHexGridRect(hexGrid, sourceWidth, bounds) {
    const out = new Array(bounds.width * bounds.height);
    for (let y = 0; y < bounds.height; y += 1) {
      const srcY = bounds.minY + y;
      for (let x = 0; x < bounds.width; x += 1) {
        const srcX = bounds.minX + x;
        out[y * bounds.width + x] = hexGrid[srcY * sourceWidth + srcX] || "#FFFFFF";
      }
    }
    return out;
  },
  scaleHexGridNearest(sourceGrid, sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const output = new Array(targetWidth * targetHeight);
    for (let y = 0; y < targetHeight; y += 1) {
      const srcY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
      for (let x = 0; x < targetWidth; x += 1) {
        const srcX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
        output[y * targetWidth + x] = sourceGrid[srcY * sourceWidth + srcX] || "#FFFFFF";
      }
    }
    return output;
  },
  resampleRgbaRegionToTarget(rawPixels, sourceWidth, sourceHeight, bounds, targetWidth, targetHeight, options = {}) {
    const safeTargetW = Math.max(1, Math.floor(targetWidth));
    const safeTargetH = Math.max(1, Math.floor(targetHeight));
    const safeSourceW = Math.max(1, Math.floor(sourceWidth));
    const safeSourceH = Math.max(1, Math.floor(sourceHeight));
    const out = new Uint8ClampedArray(safeTargetW * safeTargetH * 4);
    const backgroundMask = options && options.backgroundMask instanceof Uint8Array
      ? options.backgroundMask
      : null;
    const safeBounds = bounds || {
      minX: 0,
      minY: 0,
      width: safeSourceW,
      height: safeSourceH
    };
    const minX = clamp(Math.floor(safeBounds.minX || 0), 0, safeSourceW - 1);
    const minY = clamp(Math.floor(safeBounds.minY || 0), 0, safeSourceH - 1);
    const regionW = clamp(Math.floor(safeBounds.width || safeSourceW), 1, safeSourceW - minX);
    const regionH = clamp(Math.floor(safeBounds.height || safeSourceH), 1, safeSourceH - minY);
    const white = 255;
    const smallTargetBoost = Math.max(0, (40 - Math.max(safeTargetW, safeTargetH)) / 18);
    const sampleColorAt = (sx, sy) => {
      const clampedX = clamp(Math.floor(sx), 0, safeSourceW - 1);
      const clampedY = clamp(Math.floor(sy), 0, safeSourceH - 1);
      const offset = (clampedY * safeSourceW + clampedX) * 4;
      const a = clamp((Number(rawPixels[offset + 3]) || 0) / 255, 0, 1);
      const r = Number(rawPixels[offset]) || 0;
      const g = Number(rawPixels[offset + 1]) || 0;
      const b = Number(rawPixels[offset + 2]) || 0;
      return {
        r: r * a + white * (1 - a),
        g: g * a + white * (1 - a),
        b: b * a + white * (1 - a)
      };
    };
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

    for (let y = 0; y < safeTargetH; y += 1) {
      const sy0 = minY + (y * regionH / safeTargetH);
      const sy1 = minY + ((y + 1) * regionH / safeTargetH);
      const yStart = Math.floor(sy0);
      let yEnd = Math.ceil(sy1) - 1;
      if (yEnd < yStart) yEnd = yStart;
      for (let x = 0; x < safeTargetW; x += 1) {
        const sx0 = minX + (x * regionW / safeTargetW);
        const sx1 = minX + ((x + 1) * regionW / safeTargetW);
        const xStart = Math.floor(sx0);
        let xEnd = Math.ceil(sx1) - 1;
        if (xEnd < xStart) xEnd = xStart;

        let sumW = 0;
        let totalWeight = 0;
        let sumCoverage = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let minLum = 255;
        let maxLum = 0;
        let darkestColor = null;
        let brightestColor = null;
        for (let sy = yStart; sy <= yEnd; sy += 1) {
          if (sy < 0 || sy >= safeSourceH) continue;
          for (let sx = xStart; sx <= xEnd; sx += 1) {
            if (sx < 0 || sx >= safeSourceW) continue;
            const overlapX = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
            const overlapY = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
            const weight = overlapX * overlapY;
            if (weight <= 0) continue;
            totalWeight += weight;
            if (backgroundMask && backgroundMask[sy * safeSourceW + sx]) {
              continue;
            }
            const offset = (sy * safeSourceW + sx) * 4;
            const a = clamp((Number(rawPixels[offset + 3]) || 0) / 255, 0, 1);
            const r = Number(rawPixels[offset]) || 0;
            const g = Number(rawPixels[offset + 1]) || 0;
            const b = Number(rawPixels[offset + 2]) || 0;
            // Composite to white to keep transparent-edge colors stable on editor white canvas.
            const cr = r * a + white * (1 - a);
            const cg = g * a + white * (1 - a);
            const cb = b * a + white * (1 - a);
            const lum = toLum(cr, cg, cb);
            const effectiveWeight = weight * a;
            sumCoverage += effectiveWeight;
            sumW += effectiveWeight;
            sumR += cr * effectiveWeight;
            sumG += cg * effectiveWeight;
            sumB += cb * effectiveWeight;
            if (lum < minLum) {
              minLum = lum;
              darkestColor = { r: cr, g: cg, b: cb, lum };
            }
            if (lum > maxLum) {
              maxLum = lum;
              brightestColor = { r: cr, g: cg, b: cb, lum };
            }
          }
        }

        const outOffset = (y * safeTargetW + x) * 4;
        if (sumW <= 1e-7 || totalWeight <= 1e-7) {
          out[outOffset] = 255;
          out[outOffset + 1] = 255;
          out[outOffset + 2] = 255;
          out[outOffset + 3] = 0;
        } else {
          let outR = sumR / sumW;
          let outG = sumG / sumW;
          let outB = sumB / sumW;
          if (smallTargetBoost > 0 && darkestColor && brightestColor) {
            const repLum = toLum(outR, outG, outB);
            const contrast = maxLum - minLum;
            const centerColor = sampleColorAt((sx0 + sx1) / 2, (sy0 + sy1) / 2);
            const centerLum = toLum(centerColor.r, centerColor.g, centerColor.b);
            const centerDelta = Math.abs(centerLum - repLum);
            if (contrast >= 18 && centerDelta >= 10) {
              const focus = clamp(
                0.1 + smallTargetBoost * 0.12 + ((centerDelta - 10) / 42) * 0.12 + ((contrast - 18) / 48) * 0.08,
                0.08,
                0.32
              );
              outR = outR * (1 - focus) + centerColor.r * focus;
              outG = outG * (1 - focus) + centerColor.g * focus;
              outB = outB * (1 - focus) + centerColor.b * focus;
            } else if (contrast >= 22) {
              const darkGap = repLum - darkestColor.lum;
              const lightGap = brightestColor.lum - repLum;
              if (lightGap >= 16) {
                const focus = clamp(0.06 + smallTargetBoost * 0.1 + ((lightGap - 16) / 40) * 0.08, 0.05, 0.2);
                outR = outR * (1 - focus) + brightestColor.r * focus;
                outG = outG * (1 - focus) + brightestColor.g * focus;
                outB = outB * (1 - focus) + brightestColor.b * focus;
              } else if (darkGap >= 16) {
                const focus = clamp(0.06 + smallTargetBoost * 0.1 + ((darkGap - 16) / 40) * 0.08, 0.05, 0.2);
                outR = outR * (1 - focus) + darkestColor.r * focus;
                outG = outG * (1 - focus) + darkestColor.g * focus;
                outB = outB * (1 - focus) + darkestColor.b * focus;
              }
            }
          }
          out[outOffset] = clamp(Math.round(outR), 0, 255);
          out[outOffset + 1] = clamp(Math.round(outG), 0, 255);
          out[outOffset + 2] = clamp(Math.round(outB), 0, 255);
          out[outOffset + 3] = clamp(Math.round((sumCoverage / totalWeight) * 255), 0, 255);
        }
      }
    }
    return out;
  },
  enhanceFinePixelClarity(rawPixels, width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    if (!(rawPixels instanceof Uint8ClampedArray) || rawPixels.length < safeWidth * safeHeight * 4) {
      return rawPixels;
    }

    const output = new Uint8ClampedArray(rawPixels);
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const smallGridBoost = Math.max(0, (72 - Math.max(safeWidth, safeHeight)) / 72);
    const baseSharpen = 0.16 + smallGridBoost * 0.12;
    const extraSharpen = 0.24 + smallGridBoost * 0.14;
    const contrastBoost = 1.04 + smallGridBoost * 0.06;
    const saturationBoost = 1.03 + smallGridBoost * 0.05;

    for (let y = 0; y < safeHeight; y += 1) {
      for (let x = 0; x < safeWidth; x += 1) {
        const offset = (y * safeWidth + x) * 4;
        const alpha = Number(rawPixels[offset + 3]) || 0;
        if (alpha <= 0) continue;

        const baseR = Number(rawPixels[offset]) || 0;
        const baseG = Number(rawPixels[offset + 1]) || 0;
        const baseB = Number(rawPixels[offset + 2]) || 0;
        const baseLum = toLum(baseR, baseG, baseB);
        const baseChroma = Math.max(baseR, baseG, baseB) - Math.min(baseR, baseG, baseB);

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumWeight = 0;
        let nearWhiteWeight = 0;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= safeHeight) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= safeWidth) continue;
            if (dx === 0 && dy === 0) continue;
            const nOffset = (ny * safeWidth + nx) * 4;
            const nAlpha = Number(rawPixels[nOffset + 3]) || 0;
            if (nAlpha <= 0) continue;
            const weight = dx === 0 || dy === 0 ? 1 : 0.72;
            const nr = Number(rawPixels[nOffset]) || 0;
            const ng = Number(rawPixels[nOffset + 1]) || 0;
            const nb = Number(rawPixels[nOffset + 2]) || 0;
            sumR += nr * weight;
            sumG += ng * weight;
            sumB += nb * weight;
            sumWeight += weight;
            const nLum = toLum(nr, ng, nb);
            const nChroma = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);
            if (nLum >= 242 && nChroma <= 20) nearWhiteWeight += weight;
          }
        }

        if (sumWeight <= 0) continue;

        const avgR = sumR / sumWeight;
        const avgG = sumG / sumWeight;
        const avgB = sumB / sumWeight;
        const avgLum = toLum(avgR, avgG, avgB);
        const lumContrast = Math.abs(baseLum - avgLum);
        const detailScore = clamp((lumContrast - 5) / 34, 0, 1);

        if (baseLum >= 243 && avgLum >= 243 && lumContrast <= 4) {
          output[offset] = 255;
          output[offset + 1] = 255;
          output[offset + 2] = 255;
          output[offset + 3] = 255;
          continue;
        }
        if (nearWhiteWeight >= sumWeight * 0.78 && baseLum >= 236 && detailScore < 0.2) {
          output[offset] = 255;
          output[offset + 1] = 255;
          output[offset + 2] = 255;
          output[offset + 3] = 255;
          continue;
        }

        const sharpen = clamp(baseSharpen + detailScore * extraSharpen, 0.12, 0.52);
        let nextR = baseR + (baseR - avgR) * sharpen;
        let nextG = baseG + (baseG - avgG) * sharpen;
        let nextB = baseB + (baseB - avgB) * sharpen;

        const localContrastGain = 1 + detailScore * (contrastBoost - 1);
        nextR = (nextR - 128) * localContrastGain + 128;
        nextG = (nextG - 128) * localContrastGain + 128;
        nextB = (nextB - 128) * localContrastGain + 128;

        const nextLum = toLum(nextR, nextG, nextB);
        const satGain = saturationBoost + (baseChroma <= 42 ? 0.03 : 0);
        nextR = nextLum + (nextR - nextLum) * satGain;
        nextG = nextLum + (nextG - nextLum) * satGain;
        nextB = nextLum + (nextB - nextLum) * satGain;

        output[offset] = clamp(Math.round(nextR), 0, 255);
        output[offset + 1] = clamp(Math.round(nextG), 0, 255);
        output[offset + 2] = clamp(Math.round(nextB), 0, 255);
        output[offset + 3] = 255;
      }
    }
    return output;
  },
  enhanceIllustrationFineClarity(rawPixels, width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    if (!(rawPixels instanceof Uint8ClampedArray) || rawPixels.length < safeWidth * safeHeight * 4) {
      return rawPixels;
    }

    const output = new Uint8ClampedArray(rawPixels);
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

    for (let y = 0; y < safeHeight; y += 1) {
      for (let x = 0; x < safeWidth; x += 1) {
        const offset = (y * safeWidth + x) * 4;
        const alpha = Number(rawPixels[offset + 3]) || 0;
        if (alpha <= 0) continue;

        const baseR = Number(rawPixels[offset]) || 0;
        const baseG = Number(rawPixels[offset + 1]) || 0;
        const baseB = Number(rawPixels[offset + 2]) || 0;
        const baseLum = toLum(baseR, baseG, baseB);
        const baseChroma = Math.max(baseR, baseG, baseB) - Math.min(baseR, baseG, baseB);

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumWeight = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= safeHeight) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= safeWidth) continue;
            if (dx === 0 && dy === 0) continue;
            const nOffset = (ny * safeWidth + nx) * 4;
            const nAlpha = Number(rawPixels[nOffset + 3]) || 0;
            if (nAlpha <= 0) continue;
            const weight = dx === 0 || dy === 0 ? 1 : 0.72;
            sumR += (Number(rawPixels[nOffset]) || 0) * weight;
            sumG += (Number(rawPixels[nOffset + 1]) || 0) * weight;
            sumB += (Number(rawPixels[nOffset + 2]) || 0) * weight;
            sumWeight += weight;
          }
        }
        if (sumWeight <= 0) continue;

        const avgR = sumR / sumWeight;
        const avgG = sumG / sumWeight;
        const avgB = sumB / sumWeight;
        const avgLum = toLum(avgR, avgG, avgB);
        const detailScore = clamp((Math.abs(baseLum - avgLum) - 4) / 28, 0, 1);
        const sharpen = 0.08 + detailScore * 0.12;

        let nextR = baseR + (baseR - avgR) * sharpen;
        let nextG = baseG + (baseG - avgG) * sharpen;
        let nextB = baseB + (baseB - avgB) * sharpen;

        const nextLum = toLum(nextR, nextG, nextB);
        const satGain = baseChroma <= 56 ? 1.04 : 1.02;
        nextR = nextLum + (nextR - nextLum) * satGain;
        nextG = nextLum + (nextG - nextLum) * satGain;
        nextB = nextLum + (nextB - nextLum) * satGain;

        output[offset] = clamp(Math.round(nextR), 0, 255);
        output[offset + 1] = clamp(Math.round(nextG), 0, 255);
        output[offset + 2] = clamp(Math.round(nextB), 0, 255);
        output[offset + 3] = alpha;
      }
    }
    return output;
  },
  enhanceCartoonPixelClarity(rawPixels, width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    if (!(rawPixels instanceof Uint8ClampedArray) || rawPixels.length < safeWidth * safeHeight * 4) {
      return rawPixels;
    }

    const output = new Uint8ClampedArray(rawPixels);
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const smallGridBoost = Math.max(0, (88 - Math.max(safeWidth, safeHeight)) / 88);

    for (let y = 0; y < safeHeight; y += 1) {
      for (let x = 0; x < safeWidth; x += 1) {
        const offset = (y * safeWidth + x) * 4;
        const alpha = Number(rawPixels[offset + 3]) || 0;
        if (alpha <= 0) continue;

        const baseR = Number(rawPixels[offset]) || 0;
        const baseG = Number(rawPixels[offset + 1]) || 0;
        const baseB = Number(rawPixels[offset + 2]) || 0;
        const baseLum = toLum(baseR, baseG, baseB);
        const baseChroma = Math.max(baseR, baseG, baseB) - Math.min(baseR, baseG, baseB);

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumWeight = 0;
        let nearWhiteWeight = 0;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= safeHeight) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= safeWidth) continue;
            if (dx === 0 && dy === 0) continue;
            const nOffset = (ny * safeWidth + nx) * 4;
            const nAlpha = Number(rawPixels[nOffset + 3]) || 0;
            if (nAlpha <= 0) continue;
            const weight = dx === 0 || dy === 0 ? 1 : 0.74;
            const nr = Number(rawPixels[nOffset]) || 0;
            const ng = Number(rawPixels[nOffset + 1]) || 0;
            const nb = Number(rawPixels[nOffset + 2]) || 0;
            sumR += nr * weight;
            sumG += ng * weight;
            sumB += nb * weight;
            sumWeight += weight;
            const nLum = toLum(nr, ng, nb);
            const nChroma = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);
            if (nLum >= 244 && nChroma <= 18) nearWhiteWeight += weight;
          }
        }

        if (sumWeight <= 0) continue;

        const avgR = sumR / sumWeight;
        const avgG = sumG / sumWeight;
        const avgB = sumB / sumWeight;
        const avgLum = toLum(avgR, avgG, avgB);
        const lumContrast = Math.abs(baseLum - avgLum);
        const chromaContrast = Math.abs(baseChroma - (Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB)));
        const detailScore = clamp((lumContrast - 4) / 30, 0, 1);
        const edgeScore = clamp((lumContrast - 8) / 36 + chromaContrast / 140, 0, 1);

        if (baseLum >= 246 && avgLum >= 246 && lumContrast <= 3) {
          output[offset] = 255;
          output[offset + 1] = 255;
          output[offset + 2] = 255;
          output[offset + 3] = 255;
          continue;
        }
        if (nearWhiteWeight >= sumWeight * 0.82 && baseLum >= 238 && detailScore < 0.16) {
          output[offset] = 255;
          output[offset + 1] = 255;
          output[offset + 2] = 255;
          output[offset + 3] = 255;
          continue;
        }

        const sharpen = clamp(0.14 + smallGridBoost * 0.08 + detailScore * 0.14, 0.12, 0.34);
        let nextR = baseR + (baseR - avgR) * sharpen;
        let nextG = baseG + (baseG - avgG) * sharpen;
        let nextB = baseB + (baseB - avgB) * sharpen;

        const contrastGain = 1.03 + smallGridBoost * 0.03 + detailScore * 0.03;
        nextR = (nextR - 128) * contrastGain + 128;
        nextG = (nextG - 128) * contrastGain + 128;
        nextB = (nextB - 128) * contrastGain + 128;

        const nextLum = toLum(nextR, nextG, nextB);
        const satGain = 1.06 + smallGridBoost * 0.04 + (baseChroma <= 46 ? 0.05 : 0);
        nextR = nextLum + (nextR - nextLum) * satGain;
        nextG = nextLum + (nextG - nextLum) * satGain;
        nextB = nextLum + (nextB - nextLum) * satGain;

        const shouldDarkenEdge = (
          edgeScore >= 0.52
          && baseLum <= 122
          && baseChroma <= 58
        );
        if (shouldDarkenEdge) {
          const darken = 1 - clamp(0.05 + edgeScore * 0.08 + smallGridBoost * 0.03, 0.05, 0.12);
          nextR *= darken;
          nextG *= darken;
          nextB *= darken;
          if (baseChroma <= 68) {
            const neutralLum = toLum(nextR, nextG, nextB) * 0.86;
            const neutralMix = clamp((68 - baseChroma) / 68, 0, 1) * 0.08;
            nextR = nextR * (1 - neutralMix) + neutralLum * neutralMix;
            nextG = nextG * (1 - neutralMix) + neutralLum * neutralMix;
            nextB = nextB * (1 - neutralMix) + neutralLum * neutralMix;
          }
        }

        output[offset] = clamp(Math.round(nextR), 0, 255);
        output[offset + 1] = clamp(Math.round(nextG), 0, 255);
        output[offset + 2] = clamp(Math.round(nextB), 0, 255);
        output[offset + 3] = 255;
      }
    }
    return output;
  },
  scaleHexGridSmart(sourceGrid, sourceWidth, sourceHeight, targetWidth, targetHeight, backgroundHex = "#FFFFFF") {
    const output = new Array(targetWidth * targetHeight);
    const upscale = targetWidth >= sourceWidth && targetHeight >= sourceHeight;
    const safeBackgroundHex = String(backgroundHex || "#FFFFFF").toUpperCase();
    const isBackground = (hex) => String(hex || safeBackgroundHex).toUpperCase() === safeBackgroundHex;
    const rgbByHex = Object.create(null);
    for (let i = 0; i < EDITOR_PALETTE.length; i += 1) {
      const item = EDITOR_PALETTE[i];
      if (!item || !item.hex) continue;
      rgbByHex[item.hex.toUpperCase()] = item.rgb || parseHexRgb(item.hex);
    }
    rgbByHex[safeBackgroundHex] = parseHexRgb(safeBackgroundHex);

    if (upscale) {
      return this.scaleHexGridNearest(sourceGrid, sourceWidth, sourceHeight, targetWidth, targetHeight);
    }

    for (let y = 0; y < targetHeight; y += 1) {
      const sy0 = y * sourceHeight / targetHeight;
      const sy1 = (y + 1) * sourceHeight / targetHeight;
      const yStart = Math.floor(sy0);
      let yEnd = Math.ceil(sy1) - 1;
      if (yEnd < yStart) yEnd = yStart;
      for (let x = 0; x < targetWidth; x += 1) {
        const sx0 = x * sourceWidth / targetWidth;
        const sx1 = (x + 1) * sourceWidth / targetWidth;
        const xStart = Math.floor(sx0);
        let xEnd = Math.ceil(sx1) - 1;
        if (xEnd < xStart) xEnd = xStart;

        let fgWeight = 0;
        let bgWeight = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        const colorWeights = Object.create(null);

        for (let sy = yStart; sy <= yEnd; sy += 1) {
          for (let sx = xStart; sx <= xEnd; sx += 1) {
            const overlapX = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
            const overlapY = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
            const weight = overlapX * overlapY;
            if (weight <= 0) continue;
            const hex = String(sourceGrid[sy * sourceWidth + sx] || safeBackgroundHex).toUpperCase();
            if (isBackground(hex)) {
              bgWeight += weight;
              continue;
            }
            const rgb = rgbByHex[hex] || parseHexRgb(hex);
            fgWeight += weight;
            sumR += rgb.r * weight;
            sumG += rgb.g * weight;
            sumB += rgb.b * weight;
            colorWeights[hex] = (colorWeights[hex] || 0) + weight;
          }
        }

        const totalWeight = fgWeight + bgWeight;
        const fgCoverage = totalWeight > 0 ? (fgWeight / totalWeight) : 0;
        const centerSrcX = Math.min(sourceWidth - 1, Math.max(0, Math.floor((sx0 + sx1) / 2)));
        const centerSrcY = Math.min(sourceHeight - 1, Math.max(0, Math.floor((sy0 + sy1) / 2)));
        const centerHex = String(sourceGrid[centerSrcY * sourceWidth + centerSrcX] || safeBackgroundHex).toUpperCase();
        const centerSupport = colorWeights[centerHex] || 0;
        if (fgWeight <= 0) {
          output[y * targetWidth + x] = safeBackgroundHex;
          continue;
        }
        // Lower threshold to preserve tiny detached details (stars, short lines, etc.).
        if (fgCoverage < 0.07) {
          if (!isBackground(centerHex) && centerSupport > 0) {
            output[y * targetWidth + x] = centerHex;
          } else {
            output[y * targetWidth + x] = safeBackgroundHex;
          }
          continue;
        }

        let target = {
          r: sumR / fgWeight,
          g: sumG / fgWeight,
          b: sumB / fgWeight
        };
        if (!isBackground(centerHex) && centerSupport > 0 && fgCoverage < 0.45) {
          output[y * targetWidth + x] = centerHex;
          continue;
        }
        if (!isBackground(centerHex)) {
          const centerRgb = rgbByHex[centerHex] || parseHexRgb(centerHex);
          target = {
            r: target.r * 0.72 + centerRgb.r * 0.28,
            g: target.g * 0.72 + centerRgb.g * 0.28,
            b: target.b * 0.72 + centerRgb.b * 0.28
          };
        }

        let bestHex = safeBackgroundHex;
        let bestScore = Number.POSITIVE_INFINITY;
        Object.keys(colorWeights).forEach((hex) => {
          const rgb = rgbByHex[hex] || parseHexRgb(hex);
          const dist = distanceSqRgb(target, rgb);
          const support = colorWeights[hex] || 0;
          const centerBonus = hex === centerHex ? 0.16 : 0;
          const score = dist - support * 2200 - centerBonus * 1800;
          if (score < bestScore) {
            bestScore = score;
            bestHex = hex;
          }
        });
        output[y * targetWidth + x] = bestHex;
      }
    }

    return output;
  },
  buildSquareHexGrid(rectGrid, rectWidth, rectHeight, squareSize, backgroundHex = "#FFFFFF") {
    const safeBackgroundHex = String(backgroundHex || "#FFFFFF").toUpperCase();
    const output = new Array(squareSize * squareSize).fill(safeBackgroundHex);
    const offsetX = Math.floor((squareSize - rectWidth) / 2);
    const offsetY = Math.floor((squareSize - rectHeight) / 2);
    for (let y = 0; y < rectHeight; y += 1) {
      for (let x = 0; x < rectWidth; x += 1) {
        const targetX = offsetX + x;
        const targetY = offsetY + y;
        if (targetX < 0 || targetY < 0 || targetX >= squareSize || targetY >= squareSize) continue;
        output[targetY * squareSize + targetX] = rectGrid[y * rectWidth + x] || "#FFFFFF";
      }
    }
    return {
      squareGrid: output,
      offsetX,
      offsetY
    };
  },
  isDarkOutlineIndex(index, backgroundIndex) {
    if (!Number.isFinite(index) || index < 0) return false;
    if (Number.isFinite(backgroundIndex) && index === backgroundIndex) return false;
    const lum = Number(PALETTE_LUMA_BY_INDEX[index]);
    const chroma = Number(PALETTE_CHROMA_BY_INDEX[index]);
    if (!Number.isFinite(lum) || !Number.isFinite(chroma)) return false;
    return lum <= DARK_OUTLINE_LUMA_THRESHOLD && chroma <= DARK_OUTLINE_CHROMA_THRESHOLD;
  },
  resolveSmartColorLimit(foregroundCount, styleMode = STYLE_MODE_FINE) {
    const safeForeground = Math.max(0, Math.floor(Number(foregroundCount) || 0));
    if (styleMode === STYLE_MODE_CARTOON) {
      if (safeForeground <= 900) return 24;
      if (safeForeground <= 1800) return 28;
      if (safeForeground <= 3200) return 32;
      if (safeForeground <= 5200) return 36;
      return 40;
    }
    if (safeForeground <= 1200) return 28;
    if (safeForeground <= 2600) return 34;
    if (safeForeground <= 5200) return 40;
    return 46;
  },
  buildColorAdjacencyMap(indexGrid, gridSize, backgroundIndex) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    const adjacency = Object.create(null);
    if (!Array.isArray(indexGrid) || indexGrid.length < total) return adjacency;
    const addEdge = (fromIndex, toIndex, weight) => {
      if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return;
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      if (fromIndex === backgroundIndex || toIndex === backgroundIndex) return;
      const sourceKey = String(fromIndex);
      const targetKey = String(toIndex);
      const sourceMap = adjacency[sourceKey] || (adjacency[sourceKey] = Object.create(null));
      sourceMap[targetKey] = (sourceMap[targetKey] || 0) + weight;
    };
    for (let row = 0; row < safeSize; row += 1) {
      for (let col = 0; col < safeSize; col += 1) {
        const current = indexGrid[row * safeSize + col];
        if (col + 1 < safeSize) {
          const right = indexGrid[row * safeSize + (col + 1)];
          if (current !== right) {
            addEdge(current, right, 1);
            addEdge(right, current, 1);
          }
        }
        if (row + 1 < safeSize) {
          const down = indexGrid[(row + 1) * safeSize + col];
          if (current !== down) {
            addEdge(current, down, 1);
            addEdge(down, current, 1);
          }
        }
      }
    }
    return adjacency;
  },
  findSmartMergeTargetIndex(sourceIndex, keeperIndexes, countsByIndex, adjacencyByIndex, backgroundIndex) {
    const sourceMeta = EDITOR_PALETTE[sourceIndex];
    const sourceRgb = sourceMeta && sourceMeta.rgb ? sourceMeta.rgb : parseHexRgb(sourceMeta && sourceMeta.hex);
    const sourceProfile = computeRgbProfile(sourceRgb);
    const sourceLum = Number(PALETTE_LUMA_BY_INDEX[sourceIndex]) || sourceProfile.luminance || 255;
    const sourceChroma = Number(PALETTE_CHROMA_BY_INDEX[sourceIndex]) || sourceProfile.chroma || 0;
    const sourceIsDark = this.isDarkOutlineIndex(sourceIndex, backgroundIndex);
    const sourceAdjacency = adjacencyByIndex[String(sourceIndex)] || null;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < keeperIndexes.length; i += 1) {
      const targetIndex = keeperIndexes[i];
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex === sourceIndex) continue;
      const targetMeta = EDITOR_PALETTE[targetIndex];
      if (!targetMeta) continue;
      const targetRgb = targetMeta.rgb ? targetMeta.rgb : parseHexRgb(targetMeta.hex);
      const targetProfile = computeRgbProfile(targetRgb);
      const targetLum = Number(PALETTE_LUMA_BY_INDEX[targetIndex]) || targetProfile.luminance || 255;
      const targetChroma = Number(PALETTE_CHROMA_BY_INDEX[targetIndex]) || targetProfile.chroma || 0;
      const targetIsDark = this.isDarkOutlineIndex(targetIndex, backgroundIndex);
      const rgbDist = distanceSqRgb(sourceRgb, targetRgb);
      const lumDiff = Math.abs(sourceLum - targetLum);
      const chromaDiff = Math.abs(sourceChroma - targetChroma);
      const saturationDiff = Math.abs((sourceProfile.saturation || 0) - (targetProfile.saturation || 0));
      const hueDiff = hueDistance(sourceProfile.hue, targetProfile.hue);
      const targetCount = Number(countsByIndex[targetIndex]) || 0;
      const adjacency = Number(sourceAdjacency && sourceAdjacency[String(targetIndex)]) || 0;
      if (rgbDist > 3600) continue;
      if (lumDiff > 20) continue;
      if (sourceChroma >= 16 && targetChroma >= 16 && hueDiff > 0.065) continue;
      if (hueDiff > 0.1) continue;
      if (targetChroma - sourceChroma >= 18 && lumDiff >= 8) continue;
      if (targetProfile.saturation - sourceProfile.saturation >= 0.14 && lumDiff >= 6) continue;
      let score = rgbDist + lumDiff * lumDiff * 13 + chromaDiff * chromaDiff * 1.45 + saturationDiff * saturationDiff * 52000;

      if (sourceIsDark && !targetIsDark) score += 120000;
      if (!sourceIsDark && targetIsDark && sourceLum >= 125) score += 80000;
      if (targetIndex === backgroundIndex) {
        const sourceIsNearWhite = sourceLum >= 232 && sourceChroma <= 18;
        score += sourceIsNearWhite ? 6000 : 180000;
      }
      if (sourceLum >= 212 && targetLum <= 165) score += 50000;
      if (sourceLum <= 75 && targetLum >= 150) score += 70000;
      if (sourceChroma <= 14 && targetChroma >= 72 && lumDiff >= 16) score += 35000;
      if (targetChroma >= sourceChroma + 18 && sourceChroma >= 16) score += 24000;
      if (hueDiff >= 0.06) score += hueDiff * 60000;

      score -= Math.log(targetCount + 1) * 120;
      score -= adjacency * 900;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = targetIndex;
      }
    }
    return bestIndex;
  },
  reducePaletteNoise(indexGrid, gridSize, options = {}) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    if (!Array.isArray(indexGrid) || indexGrid.length < total) {
      return {
        indexGrid: Array.isArray(indexGrid) ? indexGrid.slice(0, total) : [],
        changedCells: 0,
        beforeColorCount: 0,
        afterColorCount: 0
      };
    }
    const styleMode = options.styleMode === STYLE_MODE_CARTOON ? STYLE_MODE_CARTOON : STYLE_MODE_FINE;
    const isIllustrationSource = isIllustrationSourceKind(options && options.sourceKind);
    const backgroundIndex = Number.isFinite(options.backgroundIndex) ? Number(options.backgroundIndex) : 0;
    const next = indexGrid.slice(0, total);
    const countsByIndex = Object.create(null);
    let foregroundCount = 0;

    for (let i = 0; i < total; i += 1) {
      const index = next[i];
      if (!Number.isFinite(index) || index < 0 || index === backgroundIndex) continue;
      countsByIndex[index] = (countsByIndex[index] || 0) + 1;
      foregroundCount += 1;
    }

    const entries = Object.keys(countsByIndex)
      .map((key) => ({
        index: Number(key),
        count: Number(countsByIndex[key]) || 0
      }))
      .filter((item) => Number.isFinite(item.index) && item.index >= 0 && item.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.index - b.index;
      });

    if (entries.length <= 1 || foregroundCount <= 0) {
      return {
        indexGrid: next,
        changedCells: 0,
        beforeColorCount: entries.length,
        afterColorCount: entries.length
      };
    }

    const desiredLimit = clamp(
      Number.isFinite(options.maxColors)
        ? Math.floor(options.maxColors)
        : (
          isIllustrationSource && styleMode === STYLE_MODE_FINE
            ? this.resolveSmartColorLimit(foregroundCount, styleMode) + 8
            : this.resolveSmartColorLimit(foregroundCount, styleMode)
        ),
      styleMode === STYLE_MODE_CARTOON ? CARTOON_MIN_COLOR_LIMIT : FINE_MIN_COLOR_LIMIT,
      styleMode === STYLE_MODE_CARTOON ? CARTOON_MAX_COLOR_LIMIT : FINE_MAX_COLOR_LIMIT
    );
    const rareCountThreshold = clamp(
      Number.isFinite(options.rareCountThreshold)
        ? Math.floor(options.rareCountThreshold)
        : Math.round(foregroundCount * (
          styleMode === STYLE_MODE_CARTOON
            ? 0.0008
            : (isIllustrationSource ? 0.00035 : 0.0006)
        )),
      styleMode === STYLE_MODE_CARTOON ? 2 : 1,
      styleMode === STYLE_MODE_CARTOON ? 5 : 4
    );

    if (entries.length <= desiredLimit && entries[entries.length - 1].count > rareCountThreshold) {
      return {
        indexGrid: next,
        changedCells: 0,
        beforeColorCount: entries.length,
        afterColorCount: entries.length
      };
    }

    const adjacencyByIndex = this.buildColorAdjacencyMap(next, safeSize, backgroundIndex);
    const keepSet = new Set();
    const dominantDark = entries.find((item) => (
      item.count >= Math.max(4, rareCountThreshold)
      && this.isDarkOutlineIndex(item.index, backgroundIndex)
    ));
    if (dominantDark) keepSet.add(dominantDark.index);
    for (let i = 0; i < entries.length && keepSet.size < desiredLimit; i += 1) {
      keepSet.add(entries[i].index);
    }

    const mergeMap = new Map();
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const overBudget = i >= desiredLimit;
      const isRare = entry.count <= rareCountThreshold;
      const shouldTryMerge = isIllustrationSource
        ? (entry.count <= Math.min(1, rareCountThreshold) || (overBudget && entry.count <= Math.max(2, rareCountThreshold)))
        : (isRare || overBudget);
      if (!shouldTryMerge) continue;

      if (!keepSet.has(entry.index)) {
        const targetIndex = this.findSmartMergeTargetIndex(
          entry.index,
          Array.from(keepSet),
          countsByIndex,
          adjacencyByIndex,
          backgroundIndex
        );
        if (Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex !== entry.index) {
          mergeMap.set(entry.index, targetIndex);
        }
        continue;
      }

      const targetIndex = this.findSmartMergeTargetIndex(
        entry.index,
        Array.from(keepSet).filter((index) => index !== entry.index),
        countsByIndex,
        adjacencyByIndex,
        backgroundIndex
      );
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex === entry.index) continue;
      keepSet.delete(entry.index);
      mergeMap.set(entry.index, targetIndex);
      countsByIndex[targetIndex] = (countsByIndex[targetIndex] || 0) + entry.count;
      delete countsByIndex[entry.index];
    }

    if (!mergeMap.size) {
      return {
        indexGrid: next,
        changedCells: 0,
        beforeColorCount: entries.length,
        afterColorCount: entries.length
      };
    }

    let changedCells = 0;
    for (let i = 0; i < total; i += 1) {
      const current = next[i];
      if (!mergeMap.has(current)) continue;
      next[i] = mergeMap.get(current);
      changedCells += 1;
    }

    const afterColors = new Set(next.filter((index) => Number.isFinite(index) && index >= 0 && index !== backgroundIndex));
    return {
      indexGrid: next,
      changedCells,
      beforeColorCount: entries.length,
      afterColorCount: afterColors.size
    };
  },
  mergeTinyColorComponents(indexGrid, gridSize, options = {}) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    if (!Array.isArray(indexGrid) || indexGrid.length < total) {
      return {
        indexGrid: Array.isArray(indexGrid) ? indexGrid.slice(0, total) : [],
        mergedCells: 0,
        mergedComponents: 0
      };
    }
    const styleMode = options.styleMode === STYLE_MODE_CARTOON ? STYLE_MODE_CARTOON : STYLE_MODE_FINE;
    const isIllustrationSource = isIllustrationSourceKind(options && options.sourceKind);
    const backgroundIndex = Number.isFinite(options.backgroundIndex) ? Number(options.backgroundIndex) : 0;
    const next = indexGrid.slice(0, total);
    const adjacencyByIndex = this.buildColorAdjacencyMap(next, safeSize, backgroundIndex);
    const countsByIndex = Object.create(null);
    for (let i = 0; i < total; i += 1) {
      const index = next[i];
      if (!Number.isFinite(index) || index < 0 || index === backgroundIndex) continue;
      countsByIndex[index] = (countsByIndex[index] || 0) + 1;
    }

    const maxComponentSize = Math.max(
      1,
      Math.floor(Number(options.maxComponentSize) || (
        styleMode === STYLE_MODE_CARTOON
          ? 2
          : (isIllustrationSource ? 0 : 1)
      ))
    );
    if (maxComponentSize <= 0) {
      return {
        indexGrid: next,
        mergedCells: 0,
        mergedComponents: 0
      };
    }
    const visited = new Uint8Array(total);
    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];
    let mergedCells = 0;
    let mergedComponents = 0;

    for (let start = 0; start < total; start += 1) {
      if (visited[start]) continue;
      const sourceIndex = next[start];
      if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex === backgroundIndex) {
        visited[start] = 1;
        continue;
      }

      const queue = [start];
      const cells = [];
      const boundaryCounter = Object.create(null);
      visited[start] = 1;

      while (queue.length) {
        const current = queue.pop();
        cells.push(current);
        const row = Math.floor(current / safeSize);
        const col = current - row * safeSize;
        for (let i = 0; i < neighbors.length; i += 1) {
          const nx = col + neighbors[i][0];
          const ny = row + neighbors[i][1];
          if (nx < 0 || ny < 0 || nx >= safeSize || ny >= safeSize) continue;
          const nextPos = ny * safeSize + nx;
          const nextIndex = next[nextPos];
          if (nextIndex === sourceIndex) {
            if (!visited[nextPos]) {
              visited[nextPos] = 1;
              queue.push(nextPos);
            }
            continue;
          }
          if (Number.isFinite(nextIndex) && nextIndex >= 0 && nextIndex !== backgroundIndex) {
            const key = String(nextIndex);
            boundaryCounter[key] = (boundaryCounter[key] || 0) + 1;
          }
        }
      }

      if (!cells.length || cells.length > maxComponentSize) continue;
      const candidateIndexes = Object.keys(boundaryCounter)
        .map((key) => ({
          index: Number(key),
          weight: Number(boundaryCounter[key]) || 0
        }))
        .filter((item) => Number.isFinite(item.index) && item.index >= 0 && item.index !== sourceIndex)
        .sort((a, b) => {
          if (b.weight !== a.weight) return b.weight - a.weight;
          return (Number(countsByIndex[b.index]) || 0) - (Number(countsByIndex[a.index]) || 0);
        })
        .map((item) => item.index);

      if (!candidateIndexes.length) continue;
      const targetIndex = this.findSmartMergeTargetIndex(
        sourceIndex,
        candidateIndexes,
        countsByIndex,
        adjacencyByIndex,
        backgroundIndex
      );
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex === sourceIndex) continue;

      for (let i = 0; i < cells.length; i += 1) {
        next[cells[i]] = targetIndex;
      }
      countsByIndex[targetIndex] = (countsByIndex[targetIndex] || 0) + cells.length;
      countsByIndex[sourceIndex] = Math.max(0, (countsByIndex[sourceIndex] || 0) - cells.length);
      mergedCells += cells.length;
      mergedComponents += 1;
    }

    return {
      indexGrid: next,
      mergedCells,
      mergedComponents
    };
  },
  restoreFacialFeatureAnchors(indexGrid, baseIndexGrid, gridSize, options = {}) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    if (!Array.isArray(indexGrid) || indexGrid.length < total) return Array.isArray(indexGrid) ? indexGrid.slice(0, total) : [];
    if (!Array.isArray(baseIndexGrid) || baseIndexGrid.length < total) return indexGrid.slice(0, total);
    const raw = options && options.rawTargetPixels;
    const targetWidth = Math.max(1, Math.floor(Number(options && options.targetWidth) || 0));
    const targetHeight = Math.max(1, Math.floor(Number(options && options.targetHeight) || 0));
    const offsetX = Math.floor(Number(options && options.offsetX) || 0);
    const offsetY = Math.floor(Number(options && options.offsetY) || 0);
    const backgroundIndex = Number.isFinite(options && options.backgroundIndex)
      ? Number(options.backgroundIndex)
      : -1;
    if (!(raw instanceof Uint8ClampedArray) || raw.length < targetWidth * targetHeight * 4) {
      return indexGrid.slice(0, total);
    }

    const output = indexGrid.slice(0, total);
    const faceMinCol = offsetX + Math.floor(targetWidth * 0.16);
    const faceMaxCol = offsetX + Math.max(0, Math.ceil(targetWidth * 0.84) - 1);
    const faceMinRow = offsetY + Math.floor(targetHeight * 0.16);
    const faceMaxRow = offsetY + Math.max(0, Math.ceil(targetHeight * 0.72) - 1);
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const getRawRgb = (squareCol, squareRow) => {
      const x = squareCol - offsetX;
      const y = squareRow - offsetY;
      if (x < 0 || y < 0 || x >= targetWidth || y >= targetHeight) return null;
      const offset = (y * targetWidth + x) * 4;
      return {
        r: Number(raw[offset]) || 0,
        g: Number(raw[offset + 1]) || 0,
        b: Number(raw[offset + 2]) || 0,
        a: Number(raw[offset + 3]) || 0
      };
    };
    const getRawContrast = (squareCol, squareRow, centerLum) => {
      let best = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const rgb = getRawRgb(squareCol + dx, squareRow + dy);
          if (!rgb || rgb.a <= 0) continue;
          const lum = toLum(rgb.r, rgb.g, rgb.b);
          const diff = Math.abs(centerLum - lum);
          if (diff > best) best = diff;
        }
      }
      return best;
    };

    for (let row = Math.max(1, faceMinRow); row <= Math.min(safeSize - 2, faceMaxRow); row += 1) {
      for (let col = Math.max(1, faceMinCol); col <= Math.min(safeSize - 2, faceMaxCol); col += 1) {
        const idx = row * safeSize + col;
        const current = output[idx];
        const base = baseIndexGrid[idx];
        if (!Number.isFinite(base) || base < 0 || base === backgroundIndex || base === current) continue;
        const rawRgb = getRawRgb(col, row);
        if (!rawRgb || rawRgb.a <= 0) continue;
        const rawLum = toLum(rawRgb.r, rawRgb.g, rawRgb.b);
        const rawChroma = Math.max(rawRgb.r, rawRgb.g, rawRgb.b) - Math.min(rawRgb.r, rawRgb.g, rawRgb.b);
        const localContrast = getRawContrast(col, row, rawLum);
        const baseLum = Number(PALETTE_LUMA_BY_INDEX[base]) || 255;
        const currentLum = Number(PALETTE_LUMA_BY_INDEX[current]) || 255;
        const baseChroma = Number(PALETTE_CHROMA_BY_INDEX[base]) || 0;
        const currentChroma = Number(PALETTE_CHROMA_BY_INDEX[current]) || 0;
        const shouldRestore = (
          localContrast >= 18
          && (
            rawLum <= 178
            || baseLum + 12 < currentLum
            || baseChroma >= currentChroma + 8
          )
        );
        if (!shouldRestore) continue;
        output[idx] = base;
      }
    }
    return output;
  },
  pickDominantDarkNeighborIndex(indexGrid, gridSize, col, row, backgroundIndex) {
    const counter = Object.create(null);
    const add = (idx, weight) => {
      if (!this.isDarkOutlineIndex(idx, backgroundIndex)) return;
      const key = String(idx);
      counter[key] = (counter[key] || 0) + weight;
    };
    const left = col > 0 ? indexGrid[row * gridSize + (col - 1)] : -1;
    const right = col + 1 < gridSize ? indexGrid[row * gridSize + (col + 1)] : -1;
    const up = row > 0 ? indexGrid[(row - 1) * gridSize + col] : -1;
    const down = row + 1 < gridSize ? indexGrid[(row + 1) * gridSize + col] : -1;
    add(left, 2.4);
    add(right, 2.4);
    add(up, 2.4);
    add(down, 2.4);
    if (col > 1) add(indexGrid[row * gridSize + (col - 2)], 1.3);
    if (col + 2 < gridSize) add(indexGrid[row * gridSize + (col + 2)], 1.3);
    if (row > 1) add(indexGrid[(row - 2) * gridSize + col], 1.3);
    if (row + 2 < gridSize) add(indexGrid[(row + 2) * gridSize + col], 1.3);
    if (row > 0 && col > 0) add(indexGrid[(row - 1) * gridSize + (col - 1)], 1);
    if (row > 0 && col + 1 < gridSize) add(indexGrid[(row - 1) * gridSize + (col + 1)], 1);
    if (row + 1 < gridSize && col > 0) add(indexGrid[(row + 1) * gridSize + (col - 1)], 1);
    if (row + 1 < gridSize && col + 1 < gridSize) add(indexGrid[(row + 1) * gridSize + (col + 1)], 1);

    let bestIndex = -1;
    let bestScore = -1;
    Object.keys(counter).forEach((key) => {
      const score = counter[key];
      if (score > bestScore) {
        bestScore = score;
        bestIndex = Number(key);
      }
    });
    return Number.isFinite(bestIndex) && bestIndex >= 0 ? bestIndex : DARKEST_PALETTE_INDEX;
  },
  restoreDarkOutlineContinuity(indexGrid, gridSize, options = {}) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    if (!Array.isArray(indexGrid) || indexGrid.length < total) return Array.isArray(indexGrid) ? indexGrid.slice(0, total) : [];
    const raw = options && options.rawTargetPixels;
    const targetWidth = Math.max(1, Math.floor(Number(options && options.targetWidth) || 0));
    const targetHeight = Math.max(1, Math.floor(Number(options && options.targetHeight) || 0));
    const offsetX = Math.floor(Number(options && options.offsetX) || 0);
    const offsetY = Math.floor(Number(options && options.offsetY) || 0);
    const backgroundIndex = Number.isFinite(options && options.backgroundIndex)
      ? Number(options.backgroundIndex)
      : -1;
    if (!raw || !targetWidth || !targetHeight || raw.length < targetWidth * targetHeight * 4) {
      return indexGrid.slice(0, total);
    }

    const luma = new Float32Array(targetWidth * targetHeight);
    for (let i = 0; i < targetWidth * targetHeight; i += 1) {
      const o = i * 4;
      luma[i] = 0.299 * raw[o] + 0.587 * raw[o + 1] + 0.114 * raw[o + 2];
    }
    const getRawLuma = (squareCol, squareRow) => {
      const x = squareCol - offsetX;
      const y = squareRow - offsetY;
      if (x < 0 || y < 0 || x >= targetWidth || y >= targetHeight) return 255;
      return luma[y * targetWidth + x];
    };

    let output = indexGrid.slice(0, total);
    const startCol = clamp(offsetX, 1, safeSize - 2);
    const endCol = clamp(offsetX + targetWidth - 1, 1, safeSize - 2);
    const startRow = clamp(offsetY, 1, safeSize - 2);
    const endRow = clamp(offsetY + targetHeight - 1, 1, safeSize - 2);

    for (let pass = 0; pass < 1; pass += 1) {
      const source = output.slice(0, total);
      let changed = false;
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const idx = row * safeSize + col;
          const current = source[idx];
          if (this.isDarkOutlineIndex(current, backgroundIndex)) continue;

          const lum = getRawLuma(col, row);
          const lumL = getRawLuma(col - 1, row);
          const lumR = getRawLuma(col + 1, row);
          const lumU = getRawLuma(col, row - 1);
          const lumD = getRawLuma(col, row + 1);
          const lumUL = getRawLuma(col - 1, row - 1);
          const lumUR = getRawLuma(col + 1, row - 1);
          const lumDL = getRawLuma(col - 1, row + 1);
          const lumDR = getRawLuma(col + 1, row + 1);
          const grad = Math.max(
            Math.abs(lum - lumL),
            Math.abs(lum - lumR),
            Math.abs(lum - lumU),
            Math.abs(lum - lumD)
          );
          const rawDarkNeighbors = (
            (lumL <= 118 ? 1 : 0) + (lumR <= 118 ? 1 : 0)
            + (lumU <= 118 ? 1 : 0) + (lumD <= 118 ? 1 : 0)
            + (lumUL <= 118 ? 1 : 0) + (lumUR <= 118 ? 1 : 0)
            + (lumDL <= 118 ? 1 : 0) + (lumDR <= 118 ? 1 : 0)
          );
          const background8 = 8 - rawDarkNeighbors;
          if (background8 >= 4) continue;
          if (lum > 152 && rawDarkNeighbors < 6) continue;
          if (grad < 26 && rawDarkNeighbors < 6) continue;

          const left = source[row * safeSize + (col - 1)];
          const right = source[row * safeSize + (col + 1)];
          const up = source[(row - 1) * safeSize + col];
          const down = source[(row + 1) * safeSize + col];
          const ul = source[(row - 1) * safeSize + (col - 1)];
          const ur = source[(row - 1) * safeSize + (col + 1)];
          const dl = source[(row + 1) * safeSize + (col - 1)];
          const dr = source[(row + 1) * safeSize + (col + 1)];
          const left2 = col > 1 ? source[row * safeSize + (col - 2)] : -1;
          const right2 = col + 2 < safeSize ? source[row * safeSize + (col + 2)] : -1;
          const up2 = row > 1 ? source[(row - 2) * safeSize + col] : -1;
          const down2 = row + 2 < safeSize ? source[(row + 2) * safeSize + col] : -1;
          const leftDark = this.isDarkOutlineIndex(left, backgroundIndex);
          const rightDark = this.isDarkOutlineIndex(right, backgroundIndex);
          const upDark = this.isDarkOutlineIndex(up, backgroundIndex);
          const downDark = this.isDarkOutlineIndex(down, backgroundIndex);
          const ulDark = this.isDarkOutlineIndex(ul, backgroundIndex);
          const urDark = this.isDarkOutlineIndex(ur, backgroundIndex);
          const dlDark = this.isDarkOutlineIndex(dl, backgroundIndex);
          const drDark = this.isDarkOutlineIndex(dr, backgroundIndex);
          const left2Dark = this.isDarkOutlineIndex(left2, backgroundIndex);
          const right2Dark = this.isDarkOutlineIndex(right2, backgroundIndex);
          const up2Dark = this.isDarkOutlineIndex(up2, backgroundIndex);
          const down2Dark = this.isDarkOutlineIndex(down2, backgroundIndex);
          const dark8 = (
            (leftDark ? 1 : 0) + (rightDark ? 1 : 0) + (upDark ? 1 : 0) + (downDark ? 1 : 0)
            + (ulDark ? 1 : 0) + (urDark ? 1 : 0) + (dlDark ? 1 : 0) + (drDark ? 1 : 0)
          );
          const straightBridge = (leftDark && rightDark) || (upDark && downDark);
          const diagonalBridge = (ulDark && drDark) || (urDark && dlDark);
          const cornerBridge = ((leftDark || rightDark) && (upDark || downDark) && dark8 >= 4);
          const twoStepBridge = (
            ((left2Dark && rightDark) || (leftDark && right2Dark)
              || (up2Dark && downDark) || (upDark && down2Dark))
            && dark8 >= 5
          );
          if (!(straightBridge || diagonalBridge || cornerBridge || twoStepBridge)) continue;

          const replacement = this.pickDominantDarkNeighborIndex(source, safeSize, col, row, backgroundIndex);
          if (!Number.isFinite(replacement) || replacement < 0 || replacement === current) continue;
          output[idx] = replacement;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return output;
  },
  removeIsolatedDarkSpeckles(indexGrid, gridSize, backgroundIndex) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    if (!Array.isArray(indexGrid) || indexGrid.length < total) return Array.isArray(indexGrid) ? indexGrid.slice(0, total) : [];
    const source = indexGrid.slice(0, total);
    const output = source.slice(0, total);
    const isBackground = (value) => {
      if (!Number.isFinite(value) || value < 0) return true;
      if (Number.isFinite(backgroundIndex)) return value === backgroundIndex;
      return false;
    };
    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    for (let row = 1; row < safeSize - 1; row += 1) {
      for (let col = 1; col < safeSize - 1; col += 1) {
        const idx = row * safeSize + col;
        const current = source[idx];
        if (!this.isDarkOutlineIndex(current, backgroundIndex)) continue;

        let sameCount = 0;
        let darkCount = 0;
        let nonBgCount = 0;
        for (let i = 0; i < dirs.length; i += 1) {
          const nc = col + dirs[i][0];
          const nr = row + dirs[i][1];
          const n = source[nr * safeSize + nc];
          if (n === current) sameCount += 1;
          if (this.isDarkOutlineIndex(n, backgroundIndex)) darkCount += 1;
          if (!isBackground(n)) nonBgCount += 1;
        }

        // Remove isolated dark speckles produced by aggressive edge enhancement.
        // Keep real line strokes (they usually have >=1 same-color neighbor).
        if (sameCount === 0 && darkCount <= 1 && nonBgCount <= 2) {
          output[idx] = Number.isFinite(backgroundIndex) ? backgroundIndex : 0;
        }
      }
    }
    return output;
  },
  normalizeEdgeConnectedLightBackground(indexGrid, gridSize, backgroundIndex) {
    const safeSize = Math.max(1, Math.floor(Number(gridSize) || 0));
    const total = safeSize * safeSize;
    if (!Array.isArray(indexGrid) || indexGrid.length < total) {
      return Array.isArray(indexGrid) ? indexGrid.slice(0, total) : [];
    }
    if (!Number.isFinite(backgroundIndex) || backgroundIndex < 0) {
      return indexGrid.slice(0, total);
    }
    const output = indexGrid.slice(0, total);
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const isLightBackgroundCandidate = (index) => {
      if (!Number.isFinite(index) || index < 0) return true;
      if (index === backgroundIndex) return true;
      const lum = Number(PALETTE_LUMA_BY_INDEX[index]);
      const chroma = Number(PALETTE_CHROMA_BY_INDEX[index]);
      return lum >= 232 && chroma <= 30;
    };
    const push = (position) => {
      if (position < 0 || position >= total) return;
      if (visited[position]) return;
      if (!isLightBackgroundCandidate(output[position])) return;
      visited[position] = 1;
      queue[tail++] = position;
    };

    for (let col = 0; col < safeSize; col += 1) {
      push(col);
      push((safeSize - 1) * safeSize + col);
    }
    for (let row = 1; row < safeSize - 1; row += 1) {
      push(row * safeSize);
      push(row * safeSize + (safeSize - 1));
    }

    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    while (head < tail) {
      const current = queue[head++];
      output[current] = backgroundIndex;
      const row = Math.floor(current / safeSize);
      const col = current - row * safeSize;
      for (let i = 0; i < dirs.length; i += 1) {
        const nextCol = col + dirs[i][0];
        const nextRow = row + dirs[i][1];
        if (nextCol < 0 || nextRow < 0 || nextCol >= safeSize || nextRow >= safeSize) continue;
        push(nextRow * safeSize + nextCol);
      }
    }

    return output;
  },
  buildCountMapFromHexGrid(hexGrid) {
    const counter = Object.create(null);
    for (let i = 0; i < hexGrid.length; i += 1) {
      const hex = String(hexGrid[i] || "#FFFFFF").toUpperCase();
      counter[hex] = (counter[hex] || 0) + 1;
    }
    return counter;
  },
  getPreviewCellSize(width, height, withGridLines) {
    const baseCell = withGridLines ? 12 : 10;
    const ratio = Number(this.previewPixelRatio) || 1;
    const desired = Math.round(baseCell * clamp(ratio, 1, 2));
    const maxEdge = Math.max(1, Math.floor(Math.max(width, height)));
    const maxCanvasEdge = withGridLines ? 2400 : 2200;
    const maxCell = Math.max(1, Math.floor(maxCanvasEdge / maxEdge));
    return clamp(desired, baseCell, maxCell);
  },
  async renderPatternImage(hexGrid, width, height, withGridLines) {
    const cellSize = this.getPreviewCellSize(width, height, withGridLines);
    const canvasWidth = width * cellSize;
    const canvasHeight = height * cellSize;
    const canvasSize = Math.max(canvasWidth, canvasHeight);
    await this.syncCanvasSize({ renderCanvasSize: canvasSize });

    await this.drawCanvasAsync("renderCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const color = hexGrid[index] || "#FFFFFF";
          ctx.setFillStyle(color);
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }

      if (withGridLines) {
        for (let i = 0; i <= width; i += 1) {
          const pos = i * cellSize;
          const major = i % 5 === 0;
          ctx.beginPath();
          ctx.setLineWidth(major ? 1.6 : 0.9);
          ctx.setStrokeStyle(major ? "rgba(15, 23, 42, 0.58)" : "rgba(15, 23, 42, 0.28)");
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, canvasHeight);
          ctx.stroke();
        }

        for (let i = 0; i <= height; i += 1) {
          const pos = i * cellSize;
          const major = i % 5 === 0;
          ctx.beginPath();
          ctx.setLineWidth(major ? 1.6 : 0.9);
          ctx.setStrokeStyle(major ? "rgba(15, 23, 42, 0.58)" : "rgba(15, 23, 42, 0.28)");
          ctx.moveTo(0, pos);
          ctx.lineTo(canvasWidth, pos);
          ctx.stroke();
        }
      }
    });

    return this.canvasToTempFileAsync("renderCanvas", canvasWidth, canvasHeight);
  },
  async generatePatternFromUpload(imagePath, options = {}) {
    let imageInfo = null;
    try {
      imageInfo = await this.getImageInfo(imagePath);
    } catch (error) {
      throw this.buildStageError("getImageInfo", error);
    }
    const maxEdge = this.resolveMaxEdgeFromSelection();

    // Use stronger supersampling on small max-edge sizes to reduce thin-line loss.
    const supersampleFactor = maxEdge <= 60 ? 3.2 : (maxEdge <= 80 ? 2.8 : (maxEdge <= 120 ? 2.4 : 2));
    const processingEdge = clamp(Math.round(maxEdge * supersampleFactor), maxEdge, 400);
    let sampledResult = null;
    try {
      sampledResult = await this.sampleImageToGridWithRetry(
        imagePath,
        imageInfo,
        processingEdge,
        maxEdge
      );
    } catch (error) {
      throw this.buildStageError("sampleImageToGrid", error);
    }
    const effectiveProcessingEdge = Math.max(
      maxEdge,
      Number(sampledResult && sampledResult.processingEdge) || processingEdge
    );
    const sampledImageData = sampledResult && sampledResult.imageData ? sampledResult.imageData : sampledResult;
    if (!sampledImageData || !sampledImageData.data) {
      throw this.buildStageError("sampleImageToGrid", new Error("sampled image data missing"));
    }
    const styleMode = options.styleMode === STYLE_MODE_CARTOON ? STYLE_MODE_CARTOON : STYLE_MODE_FINE;
    const shouldTrimForeground = styleMode === STYLE_MODE_CARTOON;
    const foregroundAnalysis = shouldTrimForeground
      ? this.detectForegroundRegionFromRawPixels(
        sampledImageData.data,
        effectiveProcessingEdge,
        effectiveProcessingEdge
      )
      : null;
    const backgroundHex = "#FFFFFF";
    const boundsPadding = Math.max(1, Math.floor(effectiveProcessingEdge * 0.012));
    const sourceRect = sampledResult && sampledResult.sourceRect
      ? sampledResult.sourceRect
      : {
        drawX: 0,
        drawY: 0,
        drawWidth: effectiveProcessingEdge,
        drawHeight: effectiveProcessingEdge
      };
    const wholeImportBounds = {
      minX: Math.max(0, Math.floor(sourceRect.drawX || 0)),
      minY: Math.max(0, Math.floor(sourceRect.drawY || 0)),
      maxX: Math.min(effectiveProcessingEdge - 1, Math.floor((sourceRect.drawX || 0) + Math.max(1, sourceRect.drawWidth || effectiveProcessingEdge) - 1)),
      maxY: Math.min(effectiveProcessingEdge - 1, Math.floor((sourceRect.drawY || 0) + Math.max(1, sourceRect.drawHeight || effectiveProcessingEdge) - 1)),
      width: Math.max(1, Math.floor(sourceRect.drawWidth || effectiveProcessingEdge)),
      height: Math.max(1, Math.floor(sourceRect.drawHeight || effectiveProcessingEdge))
    };
    const adaptiveBounds = shouldTrimForeground
      ? this.padContentBounds(
        foregroundAnalysis && foregroundAnalysis.bounds ? foregroundAnalysis.bounds : wholeImportBounds,
        effectiveProcessingEdge,
        effectiveProcessingEdge,
        boundsPadding
      )
      : wholeImportBounds;
    const initialBounds = adaptiveBounds || wholeImportBounds;
    const trimmedWidth = initialBounds ? initialBounds.width : effectiveProcessingEdge;
    const trimmedHeight = initialBounds ? initialBounds.height : effectiveProcessingEdge;
    const ratio = trimmedWidth / Math.max(1, trimmedHeight);
    const targetWidth = ratio >= 1
      ? maxEdge
      : Math.max(1, Math.round(maxEdge * ratio));
    const targetHeight = ratio >= 1
      ? Math.max(1, Math.round(maxEdge / Math.max(1e-6, ratio)))
      : maxEdge;
    // Color-fidelity path:
    // Resample from original RGBA region directly to target grid, then quantize once.
    // This avoids hue drift caused by "quantize first -> scale quantized colors -> choose again".
    const rawTargetPixels = this.resampleRgbaRegionToTarget(
      sampledImageData.data,
      effectiveProcessingEdge,
      effectiveProcessingEdge,
      initialBounds,
      targetWidth,
      targetHeight,
      {
        backgroundMask: shouldTrimForeground && foregroundAnalysis && foregroundAnalysis.backgroundMask
          ? foregroundAnalysis.backgroundMask
          : null
      }
    );
    const applyFineClarity = options.applyFineClarity !== false;
    const isIllustrationSource = isIllustrationSourceKind(options && options.sourceKind);
    const preparedTargetPixels = styleMode === STYLE_MODE_CARTOON
      ? this.enhanceCartoonPixelClarity(rawTargetPixels, targetWidth, targetHeight)
      : (
        applyFineClarity
          ? (
            isIllustrationSource
              ? this.enhanceIllustrationFineClarity(rawTargetPixels, targetWidth, targetHeight)
              : this.enhanceFinePixelClarity(rawTargetPixels, targetWidth, targetHeight)
          )
          : rawTargetPixels
      );
    const quantizeOptions = styleMode === STYLE_MODE_CARTOON
      ? {
        preserveAlphaColor: 0.45,
        contrastBoost: 1.04,
        saturationBoost: 1.07,
        shadowBoost: 0.04,
        neutralDarkBias: 0.1
      }
      : (
        isIllustrationSource
          ? {
            preserveAlphaColor: 0.42,
            contrastBoost: 1.02,
            saturationBoost: 1.08,
            shadowBoost: 0,
            neutralDarkBias: 0.02
          }
          : {
            preserveAlphaColor: 0.18,
            contrastBoost: 1.01,
            saturationBoost: 1.02,
            shadowBoost: 0.03,
            neutralDarkBias: 0.06
          }
      );
    const targetQuantized = quantizeToPalette(
      preparedTargetPixels,
      undefined,
      quantizeOptions
    );
    const scaledRectGrid = targetQuantized.hexGrid;
    const squareResult = this.buildSquareHexGrid(
      scaledRectGrid,
      targetWidth,
      targetHeight,
      maxEdge,
      backgroundHex
    );
    const squareHexGrid = squareResult.squareGrid;
    const safeBackgroundIndex = Number.isFinite(PALETTE_INDEX_BY_HEX[String(backgroundHex).toUpperCase()])
      ? PALETTE_INDEX_BY_HEX[String(backgroundHex).toUpperCase()]
      : 0;

    const indexGridRaw = squareHexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = PALETTE_INDEX_BY_HEX[key];
      return Number.isFinite(mapped) ? mapped : safeBackgroundIndex;
    });
    const reducedGridResult = this.reducePaletteNoise(
      indexGridRaw,
      maxEdge,
      {
        backgroundIndex: safeBackgroundIndex,
        styleMode,
        sourceKind: options && options.sourceKind ? options.sourceKind : ""
      }
    );
    let indexGridEnhanced = reducedGridResult.indexGrid;
    indexGridEnhanced = this.restoreDarkOutlineContinuity(indexGridEnhanced, maxEdge, {
      rawTargetPixels: preparedTargetPixels,
      targetWidth,
      targetHeight,
      offsetX: squareResult.offsetX,
      offsetY: squareResult.offsetY,
      backgroundIndex: safeBackgroundIndex
    });
    indexGridEnhanced = this.removeIsolatedDarkSpeckles(indexGridEnhanced, maxEdge, safeBackgroundIndex);
    const tinyMergeResult = this.mergeTinyColorComponents(indexGridEnhanced, maxEdge, {
      backgroundIndex: safeBackgroundIndex,
      styleMode,
      sourceKind: options && options.sourceKind ? options.sourceKind : "",
      maxComponentSize: styleMode === STYLE_MODE_CARTOON ? 2 : 1
    });
    indexGridEnhanced = tinyMergeResult.indexGrid;
    indexGridEnhanced = this.restoreFacialFeatureAnchors(
      indexGridEnhanced,
      indexGridRaw,
      maxEdge,
      {
        rawTargetPixels: preparedTargetPixels,
        targetWidth,
        targetHeight,
        offsetX: squareResult.offsetX,
        offsetY: squareResult.offsetY,
        backgroundIndex: safeBackgroundIndex
      }
    );
    if (isIllustrationSource && styleMode === STYLE_MODE_FINE) {
      indexGridEnhanced = this.normalizeEdgeConnectedLightBackground(
        indexGridEnhanced,
        maxEdge,
        safeBackgroundIndex
      );
    }
    const usedColorIndexes = [...new Set(indexGridEnhanced)].sort((a, b) => a - b);
    const enhancedRectGrid = this.buildRectHexGridFromSquareIndexGrid(
      indexGridEnhanced,
      maxEdge,
      squareResult.offsetX,
      squareResult.offsetY,
      targetWidth,
      targetHeight,
      backgroundHex,
      safeBackgroundIndex
    );
    const scaledCounts = this.buildCountMapFromHexGrid(enhancedRectGrid);
    console.log("[palette-reducer] generation", {
      styleMode,
      before: reducedGridResult.beforeColorCount,
      after: reducedGridResult.afterColorCount,
      changedCells: reducedGridResult.changedCells,
      tinyMergedCells: tinyMergeResult.mergedCells,
      tinyMergedComponents: tinyMergeResult.mergedComponents
    });
    let pixelImagePath = "";
    let gridImagePath = "";
    try {
      pixelImagePath = await this.renderPatternImage(enhancedRectGrid, targetWidth, targetHeight, false);
    } catch (error) {
      console.warn("render ai preview failed", error);
    }
    try {
      gridImagePath = await this.renderPatternImage(enhancedRectGrid, targetWidth, targetHeight, true);
    } catch (error) {
      console.warn("render grid preview failed", error);
    }

    return {
      gridSize: maxEdge,
      displayWidth: targetWidth,
      displayHeight: targetHeight,
      pixelImagePath,
      gridImagePath,
      estimate: {
        total: targetWidth * targetHeight,
        colorUsed: Object.keys(scaledCounts).filter((hex) => String(hex || "").toUpperCase() !== String(backgroundHex).toUpperCase()).length
      },
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize: maxEdge,
        indexGridPacked: packIndexGrid(indexGridEnhanced, EDITOR_MAX_INDEX),
        usedColorIndexes,
        backgroundHex,
        userEdited: false,
        paletteVersion: "mard221",
        visibleBounds: {
          minCol: squareResult.offsetX,
          minRow: squareResult.offsetY,
          maxCol: squareResult.offsetX + targetWidth - 1,
          maxRow: squareResult.offsetY + targetHeight - 1
        }
      }
    };
  },
  buildPendingWorkRecord(workName, styleMode = STYLE_MODE_FINE) {
    const workId = `w-${Date.now()}`;
    return {
      id: workId,
      title: workName || "AI生成拼豆作品",
      date: "刚刚",
      createdAt: Date.now(),
      size: "转换中",
      style: this.getStyleLabel(styleMode),
      status: "转换中",
      isGenerating: true,
      isFailed: false,
      failReason: "",
      views: 0,
      saves: 0,
      clones: 0,
      earnCoin: 0,
      previewTones: {
        origin: "origin-a",
        ai: "ai-a",
        grid: "grid-a"
      },
      previewImages: {
        origin: this.data.uploadImagePath,
        ai: "",
        grid: ""
      }
    };
  },
  buildStageError(stage, error) {
    const errMsg = error && error.errMsg ? String(error.errMsg) : "";
    const message = error && error.message ? String(error.message) : "";
    const detail = errMsg || message || String(error || "");
    const safe = detail.replace(/\s+/g, " ").trim();
    const wrapped = new Error(`[convert:${stage}] ${safe || "unknown error"}`);
    wrapped.stage = stage;
    wrapped.errMsg = errMsg;
    wrapped.originMessage = message;
    return wrapped;
  },
  async handleStartAiConvert() {
    if (!this.data.uploadImagePath) {
      wx.showToast({ title: "请先上传图片", icon: "none" });
      return;
    }
    if (this.data.isConverting) {
      wx.showToast({ title: "正在转换中，请稍候", icon: "none" });
      return;
    }
    if (this.data.selectedMaxEdge === "custom") {
      const val = parseInt(this.data.customMaxEdge, 10);
      if (!Number.isFinite(val) || val < 10 || val > 200) {
        wx.showToast({ title: "请输入10-200的图案边长", icon: "none" });
        return;
      }
    }

    const suggestion = this.buildSuggestedWorkName(this.data.uploadImageName);
    this.setData({
      showNamingModal: true,
      namingDraft: suggestion,
      namingError: ""
    });
  },
  async executeAiConvert(workName) {
    const selectedStyleMode = this.getSelectedStyleMode();
    let effectiveStyleMode = selectedStyleMode;
    let styleLabel = this.getStyleLabel(effectiveStyleMode);
    let fineSourceKind = "";
    let persistedOrigin = "";
    try {
      persistedOrigin = await this.ensurePersistentImagePath(
        this.data.uploadImagePath,
        `origin_${Date.now()}`
      );
    } catch (error) {
      persistedOrigin = this.data.uploadImagePath || "";
    }
    const sourceImagePath = persistedOrigin || this.data.uploadImagePath;
    if (!sourceImagePath) {
      wx.showToast({ title: "原图读取失败，请重新上传", icon: "none" });
      return;
    }
    const pendingWork = this.buildPendingWorkRecord(workName, selectedStyleMode);
    if (sourceImagePath) {
      pendingWork.previewImages.origin = sourceImagePath;
    }
    this.prependWork(pendingWork);

    await this.setDataAsync({
      showUploadModal: false,
      isConverting: true
    });

    wx.showLoading({
      title: selectedStyleMode === STYLE_MODE_CARTOON ? "Q版重绘中" : "图纸生成中",
      mask: true
    });

    try {
      let styleSourceImagePath = sourceImagePath;
      let qVersionPreviewPath = "";
      let qVersionProvider = "";
      let fineEnhancePreviewPath = "";
      let fineEnhanceProvider = "";
      if (selectedStyleMode === STYLE_MODE_CARTOON) {
        try {
          const qResult = await this.runQVersionStylization(sourceImagePath, {
            workId: pendingWork.id,
            workName: workName || "",
            maxEdge: this.resolveMaxEdgeFromSelection()
          });
          if (qResult && qResult.imagePath && !qResult.usedFallback) {
            styleSourceImagePath = qResult.imagePath;
            qVersionPreviewPath = qResult.imagePath;
          }
          qVersionProvider = String(qResult && qResult.provider || "");
          console.log("[q-style] result", qResult);
          if (qResult && qResult.usedFallback) {
            effectiveStyleMode = STYLE_MODE_FINE;
            styleLabel = this.getStyleLabel(effectiveStyleMode);
            qVersionPreviewPath = "";
            qVersionProvider = "";
            styleSourceImagePath = sourceImagePath;
            wx.showToast({
              title: "Q版服务未启用，已按精致像素处理",
              icon: "none",
              duration: 1800
            });
          } else {
            wx.showLoading({
              title: "Q版完成，图纸生成中",
              mask: true
            });
          }
        } catch (qError) {
          const qConfig = this.buildQVersionApiConfig();
          if (qConfig.required) {
            throw this.buildStageError("q-style", qError);
          }
          console.warn("q-style unavailable, fallback to fine pipeline", qError);
          effectiveStyleMode = STYLE_MODE_FINE;
          styleLabel = this.getStyleLabel(effectiveStyleMode);
          qVersionPreviewPath = "";
          qVersionProvider = "";
          wx.showToast({
            title: "Q版接口异常，已回退精致像素",
            icon: "none",
            duration: 1800
          });
          styleSourceImagePath = sourceImagePath;
          wx.showLoading({
            title: "图纸生成中",
            mask: true
          });
        }
      }
      if (selectedStyleMode === STYLE_MODE_FINE) {
        fineSourceKind = await this.classifySourceImageType(sourceImagePath);
        if (fineSourceKind === SOURCE_KIND_ILLUSTRATION) {
          const sourceProfile = await this.analyzeImageVisualProfile(sourceImagePath);
          wx.showLoading({
            title: "插画增强中",
            mask: true
          });
          try {
            const enhanced = await this.requestIllustrationEnhanceDirectFromSeedream(sourceImagePath, {
              workId: pendingWork.id,
              workName: workName || "",
              maxEdge: this.resolveMaxEdgeFromSelection()
            });
            if (enhanced && enhanced.imagePath) {
              const enhancedProfile = await this.analyzeImageVisualProfile(enhanced.imagePath);
              const shouldReject = this.shouldRejectIllustrationEnhancement(sourceProfile, enhancedProfile);
              console.log("[fine-illustration] profile-compare", {
                sourceProfile,
                enhancedProfile,
                shouldReject
              });
              if (!shouldReject) {
                styleSourceImagePath = enhanced.imagePath;
                fineEnhancePreviewPath = enhanced.imagePath;
                fineEnhanceProvider = String(enhanced.provider || "");
              } else {
                fineSourceKind = SOURCE_KIND_PHOTO;
                fineEnhancePreviewPath = "";
                fineEnhanceProvider = "";
                styleSourceImagePath = sourceImagePath;
                wx.showToast({
                  title: "增强结果偏暗，已按原图生成",
                  icon: "none",
                  duration: 1800
                });
              }
            }
            console.log("[fine-illustration] enhanced", enhanced);
            wx.showLoading({
              title: "增强完成，图纸生成中",
              mask: true
            });
          } catch (enhanceError) {
            console.warn("fine illustration enhancement unavailable, fallback to original fine pipeline", enhanceError);
            fineSourceKind = SOURCE_KIND_PHOTO;
            fineEnhancePreviewPath = "";
            fineEnhanceProvider = "";
            styleSourceImagePath = sourceImagePath;
            wx.showToast({
              title: "插画增强异常，已按原图生成",
              icon: "none",
              duration: 1800
            });
            wx.showLoading({
              title: "图纸生成中",
              mask: true
            });
          }
        }
        if (fineSourceKind === SOURCE_KIND_CLEAN_ILLUSTRATION) {
          wx.showToast({
            title: "检测到干净插画，直接生成图纸",
            icon: "none",
            duration: 1400
          });
        }
      }

      const result = await this.generatePatternFromUpload(
        styleSourceImagePath,
        {
          applyFineClarity: effectiveStyleMode === STYLE_MODE_FINE,
          styleMode: effectiveStyleMode,
          sourceKind: effectiveStyleMode === STYLE_MODE_FINE ? fineSourceKind : ""
        }
      );

      const persistedAi = await this.ensurePersistentImagePath(result.pixelImagePath, `${pendingWork.id}_ai`);
      const persistedGrid = await this.ensurePersistentImagePath(result.gridImagePath, `${pendingWork.id}_grid`);
      let persistedQVersion = "";
      if (effectiveStyleMode === STYLE_MODE_CARTOON && qVersionPreviewPath) {
        try {
          persistedQVersion = await this.ensurePersistentImagePath(qVersionPreviewPath, `${pendingWork.id}_qv`);
        } catch (error) {
          console.warn("persist q-version preview failed", error);
        }
      }

      this.updateWorkLibrary(pendingWork.id, (work) => ({
        ...work,
        status: "已完成",
        isGenerating: false,
        isFailed: false,
        failReason: "",
        date: "刚刚",
        createdAt: work.createdAt || Date.now(),
        size: `${result.displayWidth}x${result.displayHeight}`,
        style: styleLabel,
        previewImages: {
          origin: sourceImagePath || (work.previewImages && work.previewImages.origin) || "",
          ai: persistedQVersion || qVersionPreviewPath || fineEnhancePreviewPath || persistedAi || result.pixelImagePath || sourceImagePath || "",
          grid: persistedGrid || result.gridImagePath || ""
        },
        qStyleMeta: effectiveStyleMode === STYLE_MODE_CARTOON ? {
          provider: qVersionProvider,
          locked: true
        } : null,
        fineEnhanceMeta: effectiveStyleMode === STYLE_MODE_FINE && fineEnhancePreviewPath ? {
          provider: fineEnhanceProvider,
          sourceKind: fineSourceKind || SOURCE_KIND_ILLUSTRATION
        } : null,
        beadEstimate: result.estimate,
        editorData: result.editorData
          ? {
            ...result.editorData,
            styleMode: effectiveStyleMode,
            sourceKind: fineSourceKind || undefined,
            maxEdgeLocked: effectiveStyleMode === STYLE_MODE_CARTOON
          }
          : result.editorData
      }));

      wx.showToast({
        title: "图纸生成成功",
        icon: "success"
      });
    } catch (error) {
      const reason = this.buildFriendlyStageErrorMessage(error) || String(
        (error && error.message)
        || (error && error.errMsg)
        || "未知错误"
      );
      console.error("AI convert failed", {
        error,
        errMsg: error && error.errMsg ? error.errMsg : "",
        message: error && error.message ? error.message : "",
        sourceImagePath,
        styleMode
      });
      this.updateWorkLibrary(pendingWork.id, (work) => ({
        ...work,
        status: "转换失败",
        isGenerating: false,
        isFailed: true,
        failReason: reason,
        size: "-"
      }));
      wx.showToast({
        title: "转换失败，请重试",
        icon: "none"
      });
    } finally {
      wx.hideLoading();
      this.setData({
        isConverting: false
      });
    }
  },
  handleCloseModal() {
    if (this.data.isConverting) return;
    this.setData({
      showUploadModal: false,
      showNamingModal: false
    });
  },
  handleOverlayTap() {
    this.handleCloseModal();
  },
  noop() { }
});
