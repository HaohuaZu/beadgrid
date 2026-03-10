const { MARD221_COLORS } = require("../../utils/mard221");
const { packIndexGrid, unpackIndexGrid } = require("../../utils/grid-pack");
const { quantizeToPalette } = require("../../utils/pixel-converter");

const STORAGE_KEY = "bead_work_library_v1";
const BACKUP_STORAGE_KEY = "bead_work_library_backup_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";
const MAX_UNDO_STEPS = 25;
const MIN_PATTERN_EDGE = 10;
const MAX_PATTERN_EDGE = 200;
const EDGE_PRESET_LIST = [36, 52, 72, 104, 156, 200];

const MAX_CANVAS_EDGE = 960;
const EDITOR_DATA_SCHEMA_VERSION = 3;
const EDITOR_PALETTE_VERSION = "mard221";
const LEGACY_FINE220_SHIFT_START = 183;
const EDITOR_HINT_KEY = "bead_editor_gesture_hint_v1";
const EXPORT_SETTINGS_KEY = "bead_editor_export_settings_v1";
const PUBLISHED_PAPER_STORAGE_KEY = "bead_published_paper_library_v1";
const REMIXICON_FONT_FAMILY = "remixicon";
const REMIXICON_FONT_URL = "https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.ttf";
const EXPORT_PNG_ULTRA_WIDTH = 3200;
const EXPORT_PREVIEW_WIDTH = 960;
const EXPORT_PREVIEW_HD_WIDTH = 1920;
const EDITOR_STAGE_BG = "#ECEFF3";
const EDITOR_STAGE_CHECKER_DARK = "#E6E8ED";
const EDITOR_STAGE_CHECKER_LIGHT = "#F2F4F8";
const EDITOR_STAGE_CHECKER_TILE = 18;
const EDITOR_MIN_VISIBLE_RATIO = 0.3;
const EDITOR_DIAG_LOG = true;
const BLANK_CANVAS_STYLE = "空白画布";
const PUBLISHED_PREVIEW_FILE_PREFIX = "bead_publish";
let remixIconFontReady = false;
const TOOL_LABELS = {
  paint: "画笔",
  erase: "橡皮",
  pick: "取色",
  move: "拖拽",
  moveShape: "移动图案",
  bucket: "油漆桶"
};

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseGridSizeFromText(sizeText) {
  const matched = String(sizeText || "").match(/(\d+)\s*x\s*(\d+)/i);
  if (!matched) return 0;
  const width = Number(matched[1]) || 0;
  const height = Number(matched[2]) || 0;
  if (!width || !height) return 0;
  return Math.max(width, height);
}

function parseSizePairFromText(sizeText) {
  const matched = String(sizeText || "").match(/(\d+)\s*[x×*]\s*(\d+)/i);
  if (!matched) return null;
  const width = Number(matched[1]) || 0;
  const height = Number(matched[2]) || 0;
  if (!width || !height) return null;
  return { width, height };
}

function getDefaultExportSettings() {
  return {
    showGrid: true,
    showCodes: true
  };
}

function distance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchXY(touch) {
  return {
    x: toNumber(touch && (touch.pageX || touch.clientX || touch.x)),
    y: toNumber(touch && (touch.pageY || touch.clientY || touch.y))
  };
}

function areGridEqual(a, b, total) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (!total || a.length < total || b.length < total) return false;
  for (let i = 0; i < total; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function computeContainDrawRect(srcRatio, edge) {
  const safeEdge = Math.max(1, Number(edge) || 1);
  const ratio = Number.isFinite(srcRatio) && srcRatio > 0 ? srcRatio : 1;
  // Near-square sources should fully occupy the square canvas to avoid 1px border artifacts.
  if (Math.abs(ratio - 1) < 0.02) {
    return {
      drawX: 0,
      drawY: 0,
      drawWidth: safeEdge,
      drawHeight: safeEdge
    };
  }
  let drawWidth = safeEdge;
  let drawHeight = safeEdge;
  if (ratio >= 1) {
    drawWidth = safeEdge;
    drawHeight = safeEdge / Math.max(1e-6, ratio);
  } else {
    drawHeight = safeEdge;
    drawWidth = safeEdge * ratio;
  }
  drawWidth = Math.max(1, Math.min(safeEdge, drawWidth));
  drawHeight = Math.max(1, Math.min(safeEdge, drawHeight));
  return {
    drawX: (safeEdge - drawWidth) / 2,
    drawY: (safeEdge - drawHeight) / 2,
    drawWidth,
    drawHeight
  };
}

Page({
  data: {
    workId: "",
    workName: "未命名图纸",
    gridSizeText: "--",
    viewMode: "edit",
    currentTool: "move",
    scaleText: "100%",
    scalePercent: 100,
    scaleInputValue: "100",
    showScaleOverlay: false,
    hasEditableGrid: false,
    canvasCanOverlay: false,
    overlayCanvasPath: "",
    canvasWidth: 900,
    canvasHeight: 900,
    exportCanvasSize: 520,
    exportCanvasWidth: 520,
    exportCanvasHeight: 520,
    selectedColorIndex: 0,
    selectedColorCode: "A1",
    selectedColorHex: "#FFF6D4",
    currentToolLabel: "拖拽",
    eraserMode: "normal",
    showEraserMenu: false,
    showGridLines: true,
    showLocatorLines: false,
    showColorCodeInEdit: false,
    autoSaveEnabled: true,
    showColorPicker: false,
    beadHighlightIndex: -1,
    beadStats: [],
    showAllBeadStats: false,
    showBeadStatsOverlay: false,
    bottomSectionTab: "stats",
    maxEdgeLocked: false,
    maxEdgeLockReason: "",
    patternMaxEdge: 0,
    selectedEditorMaxEdge: "52",
    customEditorMaxEdge: "",
    maxEdgeError: "",
    showEdgePicker: false,
    edgePickerStyle: "",
    edgePresetList: EDGE_PRESET_LIST.map((value) => ({ value: String(value), label: String(value) })),
    canUndo: false,
    canRedo: false,
    historyText: "0 / 0",
    iconFontReady: false,
    showMoveShapeOverlay: false,
    moveShapeDeltaText: "Δx 0 · Δy 0",
    showSaveMenu: false,
    showPublishModal: false,
    publishBusy: false,
    publishDraftTitle: "",
    publishDraftTags: "",
    publishDraftDesc: "",
    publishAllowClone: true,
    publishAllowExport: true,
    publishQrLinkType: "profile",
    usedPalette: [],
    fullPalette: [],
    showExportPanel: false,
    exportShowGrid: true,
    exportShowCodes: true,
    exportPreviewPath: "",
    exportPreviewTitle: "导出图片预览（高清）",
    exportPreviewDesc: "",
    exportLargeHint: "",
    exportPrimaryText: "导出高清图片到相册",
    exportPanelHint: "",
    exportPreviewBusy: false,
    exportBusy: false,
    exportProgressVisible: false,
    exportProgressPercent: 0,
    exportProgressText: "",
    showExportPreviewViewer: false,
    exportViewerPath: "",
    exportViewerBusy: false,
    exportViewerScale: 1,
    exportViewerScaleText: "100%",
    exportViewerBaseWidth: 0,
    exportViewerImageWidth: 0,
    exportViewerHint: ""
  },
  onLoad(query) {
    const workId = query && query.workId ? query.workId : "";
    let workName = "未命名图纸";
    if (query && query.name) {
      try {
        workName = decodeURIComponent(query.name);
      } catch (error) {
        workName = String(query.name || "未命名图纸");
      }
    }

    this.palette = (Array.isArray(MARD221_COLORS) ? MARD221_COLORS : [])
      .filter((item) => item && item.hex)
      .sort((a, b) => (toNumber(a.order, 0) - toNumber(b.order, 0)))
      .map((item, index) => ({
        index,
        code: item.code || `C${index + 1}`,
        hex: String(item.hex || "#FFFFFF").toUpperCase(),
        order: toNumber(item.order, index + 1),
        rgb: item && item.rgb && Number.isFinite(item.rgb.r)
          ? { r: item.rgb.r, g: item.rgb.g, b: item.rgb.b }
          : parseHexRgb(item && item.hex)
      }));

    if (!this.palette.length) {
      this.palette = [{ index: 0, code: "A1", hex: "#FFFFFF", order: 1 }];
    }
    this.paletteIndexByHex = Object.create(null);
    for (let i = 0; i < this.palette.length; i += 1) {
      this.paletteIndexByHex[this.palette[i].hex] = i;
    }

    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.gridSize = 0;
    this.gridIndexes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.touchState = null;
    this.canvasRect = null;
    this.canvasRatioX = 1;
    this.canvasRatioY = 1;
    this.canvasReady = false;
    this.persistTimer = null;
    this.redrawTimer = null;
    this.wheelSettleTimer = null;
    this.scaleOverlayTimer = null;
    this.lightDrawRequested = false;
    this.backgroundIndexSet = Object.create(null);
    this.hasManualEdits = false;
    this.interactionMode = "";
    this.moveTipShown = false;
    this.moveShapeTipShown = false;
    this.lastScaleUiSyncAt = 0;
    this.beadCellLabels = [];
    this.wheelHintShown = false;
    this.resizeMaster = null;
    this.resizeSourceImagePath = "";
    this.resizeSourceImageCandidates = [];
    this.sourceResizeBusy = false;
    this.pendingSourceMaxEdge = null;
    this.lastSourceVisibleBounds = null;
    this.displayBoundsOverride = null;
    this.exportPreviewDebounce = null;
    this.exportPreviewPath = "";
    this.exportViewerCacheKey = "";
    this.exportViewerPath = "";
    this.exportProgressTimer = null;
    this.exportProgressSoftPercent = 0;
    this.exportProgressCapPercent = 0;
    this.useCanvas2d = false;
    this.editorCanvasNode = null;
    this.editorCtx2d = null;
    this.lastLightRedrawAt = 0;
    this.edgePickerCloseLocked = false;
    this.edgePickerLockTimer = null;
    this.windowWidth = 375;
    this.editorInstanceId = `editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.lastWorkLibrarySource = "unknown";
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.windowWidth = Number(sysInfo && sysInfo.windowWidth) || 375;
    } catch (error) {
      this.windowWidth = 375;
    }
    this.exportSettings = this.loadExportSettings();

    this.setData({
      workId,
      workName,
      selectedColorIndex: 0,
      selectedColorCode: this.palette[0].code,
      selectedColorHex: this.palette[0].hex,
      viewMode: "edit",
      currentTool: "move",
      currentToolLabel: TOOL_LABELS.move,
      eraserMode: "normal",
      showEraserMenu: false,
      showSaveMenu: false,
      showPublishModal: false,
      publishBusy: false,
      publishDraftTitle: "",
      publishDraftTags: "",
      publishDraftDesc: "",
      publishAllowClone: true,
      publishAllowExport: true,
      publishQrLinkType: "profile",
      showGridLines: true,
      showLocatorLines: false,
      showColorCodeInEdit: false,
      autoSaveEnabled: true,
      scalePercent: 100,
      scaleInputValue: "100",
      showScaleOverlay: false,
      showColorPicker: false,
      beadHighlightIndex: -1,
      beadStats: [],
      exportShowGrid: this.exportSettings.showGrid !== false,
      exportShowCodes: this.exportSettings.showCodes !== false,
      exportPreviewTitle: "导出图片预览（高清）",
      exportPreviewDesc: "",
      exportLargeHint: "",
      exportPrimaryText: "导出高清图片到相册",
      exportPanelHint: "",
      exportPreviewBusy: false,
      exportBusy: false,
      exportProgressVisible: false,
      exportProgressPercent: 0,
      exportProgressText: "",
      showExportPreviewViewer: false,
      exportViewerPath: "",
      exportViewerBusy: false,
      exportViewerScale: 1,
      exportViewerScaleText: "100%",
      exportViewerBaseWidth: 0,
      exportViewerImageWidth: 0,
      exportViewerHint: "",
      canUndo: false,
      canRedo: false,
      historyText: "0 / 0",
      iconFontReady: remixIconFontReady,
      showMoveShapeOverlay: false,
      moveShapeDeltaText: "Δx 0 · Δy 0"
    });

    this.loadWork(workId);
  },
  ensureRemixIconFont() {
    // Use built-in fallback symbols to avoid font-network failures in mini program webview.
    if (this.data.iconFontReady) {
      this.setData({ iconFontReady: false });
    }
  },
  onReady() {
    try {
      wx.hideLoading();
    } catch (error) {
      // ignore
    }
    this.measureCanvas();
    this.maybeShowEditorHint();
    // Defer large palette data set to keep first-screen navigation smoother.
    setTimeout(() => {
      if (this.data.fullPalette.length !== this.palette.length) {
        this.setData({ fullPalette: this.palette });
      }
    }, 24);
    // Delay font loading until first paint to reduce perceived page-enter lag.
    setTimeout(() => {
      this.ensureRemixIconFont();
    }, 40);
  },
  onHide() {
    this.flushPendingPersist();
    this.handleCloseSaveMenu();
  },
  onPageScroll(event) {
    this.pageScrollTop = toNumber(event && event.scrollTop, this.pageScrollTop || 0);
  },
  onUnload() {
    this.logLoadDiagnostics("unload", {
      workId: this.data.workId,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY
    });
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.redrawTimer) {
      clearTimeout(this.redrawTimer);
      this.redrawTimer = null;
    }
    if (this.wheelSettleTimer) {
      clearTimeout(this.wheelSettleTimer);
      this.wheelSettleTimer = null;
    }
    if (this.scaleOverlayTimer) {
      clearTimeout(this.scaleOverlayTimer);
      this.scaleOverlayTimer = null;
    }
    if (this.edgePickerLockTimer) {
      clearTimeout(this.edgePickerLockTimer);
      this.edgePickerLockTimer = null;
    }
    if (this.exportProgressTimer) {
      clearInterval(this.exportProgressTimer);
      this.exportProgressTimer = null;
    }
    this.pageScrollTop = 0;
    this.flushPendingPersist();
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
  normalizeVisibleBounds(rawBounds, gridSize) {
    const size = Math.max(1, Math.floor(toNumber(gridSize, 0)));
    if (!size || !rawBounds || typeof rawBounds !== "object") return null;
    const minCol = clamp(Math.floor(toNumber(rawBounds.minCol, 0)), 0, size - 1);
    const minRow = clamp(Math.floor(toNumber(rawBounds.minRow, 0)), 0, size - 1);
    const maxCol = clamp(Math.floor(toNumber(rawBounds.maxCol, size - 1)), minCol, size - 1);
    const maxRow = clamp(Math.floor(toNumber(rawBounds.maxRow, size - 1)), minRow, size - 1);
    const cols = maxCol - minCol + 1;
    const rows = maxRow - minRow + 1;
    if (cols <= 0 || rows <= 0) return null;
    if (cols >= size && rows >= size) return null;
    return { minCol, minRow, maxCol, maxRow, cols, rows };
  },
  buildCenteredVisibleBounds(width, height, gridSize) {
    const size = Math.max(1, Math.floor(toNumber(gridSize, 0)));
    if (!size) return null;
    const cols = clamp(Math.floor(toNumber(width, size)), 1, size);
    const rows = clamp(Math.floor(toNumber(height, size)), 1, size);
    if (cols >= size && rows >= size) return null;
    const minCol = Math.floor((size - cols) / 2);
    const minRow = Math.floor((size - rows) / 2);
    const maxCol = minCol + cols - 1;
    const maxRow = minRow + rows - 1;
    return { minCol, minRow, maxCol, maxRow, cols, rows };
  },
  buildVisibleBoundsByRatio(width, height, gridSize) {
    const safeW = Math.max(1, toNumber(width, gridSize));
    const safeH = Math.max(1, toNumber(height, gridSize));
    const ratio = safeW / Math.max(1, safeH);
    let cols;
    let rows;
    if (ratio >= 1) {
      cols = gridSize;
      rows = Math.max(1, Math.round(gridSize / Math.max(1e-6, ratio)));
    } else {
      rows = gridSize;
      cols = Math.max(1, Math.round(gridSize * ratio));
    }
    return this.buildCenteredVisibleBounds(cols, rows, gridSize);
  },
  buildVisibleBoundsAroundContent(contentBounds, width, height, gridSize) {
    const size = Math.max(1, Math.floor(toNumber(gridSize, 0)));
    if (!size || !contentBounds) return null;
    const contentWidth = Math.max(1, Math.floor(toNumber(contentBounds.maxCol, 0) - toNumber(contentBounds.minCol, 0) + 1));
    const contentHeight = Math.max(1, Math.floor(toNumber(contentBounds.maxRow, 0) - toNumber(contentBounds.minRow, 0) + 1));
    const desiredWidth = clamp(Math.floor(toNumber(width, contentWidth)), 1, size);
    const desiredHeight = clamp(Math.floor(toNumber(height, contentHeight)), 1, size);
    const finalWidth = clamp(Math.max(contentWidth, desiredWidth), 1, size);
    const finalHeight = clamp(Math.max(contentHeight, desiredHeight), 1, size);

    const centerCol = (toNumber(contentBounds.minCol, 0) + toNumber(contentBounds.maxCol, 0)) / 2;
    const centerRow = (toNumber(contentBounds.minRow, 0) + toNumber(contentBounds.maxRow, 0)) / 2;
    const maxMinCol = Math.max(0, size - finalWidth);
    const maxMinRow = Math.max(0, size - finalHeight);

    const minCol = clamp(Math.round(centerCol - (finalWidth - 1) / 2), 0, maxMinCol);
    const minRow = clamp(Math.round(centerRow - (finalHeight - 1) / 2), 0, maxMinRow);
    return this.normalizeVisibleBounds({
      minCol,
      minRow,
      maxCol: minCol + finalWidth - 1,
      maxRow: minRow + finalHeight - 1
    }, size);
  },
  getBoundsArea(bounds) {
    if (!bounds) return 0;
    const cols = Math.max(0, Number(bounds.cols) || (Number(bounds.maxCol) - Number(bounds.minCol) + 1) || 0);
    const rows = Math.max(0, Number(bounds.rows) || (Number(bounds.maxRow) - Number(bounds.minRow) + 1) || 0);
    return cols * rows;
  },
  doesBoundsContain(outer, inner) {
    if (!outer || !inner) return false;
    return outer.minCol <= inner.minCol
      && outer.minRow <= inner.minRow
      && outer.maxCol >= inner.maxCol
      && outer.maxRow >= inner.maxRow;
  },
  getGridDiagnostics(indexGrid, size) {
    const safeSize = Math.max(0, Number(size) || 0);
    const total = safeSize * safeSize;
    const list = Array.isArray(indexGrid) ? indexGrid : [];
    let nonTransparent = 0;
    let nonBackground = 0;
    let invalidPalette = 0;
    let minCol = safeSize;
    let minRow = safeSize;
    let maxCol = -1;
    let maxRow = -1;
    for (let i = 0; i < Math.min(total, list.length); i += 1) {
      const idx = Number(list[i]);
      if (!Number.isFinite(idx)) {
        invalidPalette += 1;
        continue;
      }
      if (idx >= 0) nonTransparent += 1;
      if (idx >= this.palette.length) invalidPalette += 1;
      if (!this.isBackgroundCell(idx)) {
        nonBackground += 1;
        const row = Math.floor(i / safeSize);
        const col = i - row * safeSize;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }
    return {
      pageWidth: safeSize,
      pageHeight: safeSize,
      expectedPixels: total,
      actualPixels: list.length,
      nonTransparentPixels: nonTransparent,
      nonBackgroundPixels: nonBackground,
      invalidPaletteIndexes: invalidPalette,
      minX: maxCol >= minCol ? minCol : -1,
      maxX: maxCol >= minCol ? maxCol : -1,
      minY: maxRow >= minRow ? minRow : -1,
      maxY: maxRow >= minRow ? maxRow : -1
    };
  },
  assertLoadGridIntegrity(indexGrid, size, context = "") {
    const safeSize = Math.max(0, Number(size) || 0);
    const expected = safeSize * safeSize;
    const list = Array.isArray(indexGrid) ? indexGrid : [];
    if (list.length < expected) {
      console.warn("[editor][diag] grid length mismatch", {
        context,
        expected,
        actual: list.length
      });
    }
    if (!safeSize || !expected) return;
    let invalidPalette = 0;
    for (let i = 0; i < expected && i < list.length; i += 1) {
      const idx = Number(list[i]);
      if (!Number.isFinite(idx)) {
        invalidPalette += 1;
        continue;
      }
      if (idx < -1 || idx >= this.palette.length) {
        invalidPalette += 1;
      }
    }
    if (invalidPalette > 0) {
      console.warn("[editor][diag] palette index out of range", {
        context,
        invalidPalette,
        expected
      });
    }
  },
  logLoadDiagnostics(stage, payload = {}) {
    if (!EDITOR_DIAG_LOG) return;
    try {
      console.info("[editor][diag]", {
        stage,
        instanceId: this.editorInstanceId || "",
        ...payload
      });
    } catch (error) {
      // ignore log errors
    }
  },
  chooseDisplayBounds({
    savedVisibleBounds,
    contentAwareBounds,
    fallbackVisibleBounds,
    contentBounds,
    gridSize,
    sizePair
  }) {
    const size = Math.max(1, Number(gridSize) || 1);
    const saved = this.normalizeVisibleBounds(savedVisibleBounds, size);
    const contentAware = this.normalizeVisibleBounds(contentAwareBounds, size);
    const fallback = this.normalizeVisibleBounds(fallbackVisibleBounds, size);
    const content = this.normalizeVisibleBounds(contentBounds, size);

    const contentTooSmall = contentAware
      && (
        contentAware.cols < Math.max(8, Math.floor(size * 0.35))
        || contentAware.rows < Math.max(8, Math.floor(size * 0.35))
      );
    const savedContainsContent = !saved || !content || this.doesBoundsContain(saved, content);
    const savedMatchesSize = !saved || !sizePair || (
      Math.abs(saved.cols - Number(sizePair.width || 0)) <= Math.max(2, Math.floor(size * 0.2))
      && Math.abs(saved.rows - Number(sizePair.height || 0)) <= Math.max(2, Math.floor(size * 0.2))
    );
    // Product requirement: keep the full imported layout visible by default.
    // So when we know intended frame (savedVisibleBounds or size fallback), do not crop by content bounds.
    const hasIntendedFrame = Boolean(saved || fallback);

    let chosen = null;
    let reason = "none";

    // 1) Prefer saved frame when valid.
    if (saved && savedContainsContent && (savedMatchesSize || !sizePair)) {
      chosen = saved;
      reason = "savedVisibleBounds";
      // 2) Then prefer size-based frame (full imported rectangle).
    } else if (fallback) {
      chosen = fallback;
      reason = "sizeFallback";
      // 3) If only saved exists but size text is missing/inaccurate, still use saved.
    } else if (saved && savedContainsContent) {
      chosen = saved;
      reason = "savedFallback";
      // 4) Content-aware crop is last resort only when no intended frame exists.
    } else if (!hasIntendedFrame && contentAware) {
      chosen = contentAware;
      reason = contentTooSmall ? "contentAwareTooSmallOnlyFallback" : "contentAware";
    } else if (contentAware) {
      chosen = contentAware;
      reason = "contentAwareForced";
    }

    this.logLoadDiagnostics("display-bounds-select", {
      gridSize: size,
      reason,
      savedArea: this.getBoundsArea(saved),
      contentArea: this.getBoundsArea(contentAware),
      fallbackArea: this.getBoundsArea(fallback),
      savedContainsContent,
      savedMatchesSize,
      contentTooSmall,
      saved,
      contentAware,
      fallback
    });

    return chosen;
  },
  getSerializableVisibleBounds() {
    if (!this.displayBoundsOverride) return null;
    return {
      minCol: this.displayBoundsOverride.minCol,
      minRow: this.displayBoundsOverride.minRow,
      maxCol: this.displayBoundsOverride.maxCol,
      maxRow: this.displayBoundsOverride.maxRow
    };
  },
  loadExportSettings() {
    try {
      const stored = wx.getStorageSync(EXPORT_SETTINGS_KEY);
      const defaults = getDefaultExportSettings();
      if (!stored || typeof stored !== "object") return defaults;
      return {
        showGrid: stored.showGrid !== false,
        showCodes: stored.showCodes !== false
      };
    } catch (error) {
      return getDefaultExportSettings();
    }
  },
  persistExportSettings() {
    try {
      const payload = {
        showGrid: this.exportSettings ? this.exportSettings.showGrid !== false : true,
        showCodes: this.exportSettings ? this.exportSettings.showCodes !== false : true
      };
      wx.setStorageSync(EXPORT_SETTINGS_KEY, payload);
    } catch (error) {
      // ignore storage errors
    }
  },
  buildExportSummary(showGrid, showCodes) {
    const gridLabel = showGrid ? "显示网格" : "隐藏网格";
    const codeLabel = showCodes ? "显示色号" : "隐藏色号";
    return {
      title: "导出图片预览（高清）",
      desc: `上方为高清图纸，下方为完整颜色图例与统计。当前设置：${gridLabel}、${codeLabel}。`,
      largeHint: ""
    };
  },
  maybeShowEditorHint() {
    try {
      const hasShown = Boolean(wx.getStorageSync(EDITOR_HINT_KEY));
      if (hasShown) return;
      wx.setStorageSync(EDITOR_HINT_KEY, true);
      wx.showToast({
        title: "提示：双指缩放，切换“拖拽”可平移画布",
        icon: "none",
        duration: 2200
      });
    } catch (error) {
      // ignore hint storage errors
    }
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
        const fallbackName = `${PUBLISHED_PREVIEW_FILE_PREFIX}_${cleanHint || Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
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
          console.warn("persist publish preview by copy failed", copyError);
        }
      }
      console.warn("persist publish preview failed", error);
      return source;
    }
  },
  syncHistoryState() {
    const undoCount = this.undoStack.length;
    const redoCount = this.redoStack.length;
    this.setData({
      canUndo: undoCount > 0,
      canRedo: redoCount > 0,
      historyText: `${undoCount} / ${redoCount}`
    });
  },
  getToolLabel(tool, eraserMode = this.data.eraserMode) {
    if (tool === "erase") {
      return eraserMode === "flood" ? "大橡皮" : "橡皮";
    }
    return TOOL_LABELS[tool] || "画笔";
  },
  closeEraserMenu() {
    if (this.data.showEraserMenu) {
      this.setData({ showEraserMenu: false });
    }
  },
  handleCloseSaveMenu() {
    if (this.data.showSaveMenu) {
      this.setData({ showSaveMenu: false });
    }
  },
  flushPendingPersist(gridImagePath = "") {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.data.hasEditableGrid || !this.data.workId) return false;
    this.persistEditedWork(gridImagePath);
    return true;
  },
  normalizePublishTitle(title) {
    const safe = String(title || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!safe) return "";
    return safe.length > 20 ? safe.slice(0, 20) : safe;
  },
  normalizePublishTags(tags) {
    const list = String(tags || "")
      .split(/[\n,，/|｜\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
    const unique = [];
    list.forEach((item) => {
      const safe = item.slice(0, 12);
      if (!safe) return;
      if (unique.includes(safe)) return;
      unique.push(safe);
    });
    return unique.slice(0, 6);
  },
  normalizePublishDescription(desc) {
    const safe = String(desc || "").replace(/\r/g, "").trim();
    return safe.length > 300 ? safe.slice(0, 300) : safe;
  },
  openPublishModal() {
    if (!this.data.hasEditableGrid || !this.data.workId) {
      wx.showToast({ title: "暂无可发布的作品", icon: "none" });
      return;
    }
    const currentWork = this.getCurrentWorkRecord() || {};
    const publishedList = this.readPublishedPaperLibrary();
    const existingRecord = publishedList.find((item) => item && item.sourceWorkId === this.data.workId);
    const existingMeta = existingRecord && existingRecord.publishMeta && typeof existingRecord.publishMeta === "object"
      ? existingRecord.publishMeta
      : {};
    const title = this.normalizePublishTitle(existingMeta.title || currentWork.title || this.data.workName);
    const tags = Array.isArray(existingMeta.tags)
      ? existingMeta.tags.join(" ")
      : String(existingMeta.tagsText || "");
    const description = this.normalizePublishDescription(existingMeta.description || "");
    this.setData({
      showPublishModal: true,
      publishBusy: false,
      publishDraftTitle: title,
      publishDraftTags: tags,
      publishDraftDesc: description,
      publishAllowClone: existingMeta.allowClone !== false,
      publishAllowExport: existingMeta.allowExport !== false,
      publishQrLinkType: existingMeta.qrLinkType === "none" ? "none" : "profile"
    });
  },
  handleClosePublishModal() {
    if (this.data.publishBusy) return;
    if (this.data.showPublishModal) {
      this.setData({ showPublishModal: false });
    }
  },
  handlePublishTitleInput(event) {
    this.setData({
      publishDraftTitle: this.normalizePublishTitle(event && event.detail ? event.detail.value : "")
    });
  },
  handlePublishTagsInput(event) {
    const raw = String(event && event.detail ? event.detail.value : "");
    const compact = raw.replace(/\s+/g, " ").trimStart();
    this.setData({ publishDraftTags: compact.slice(0, 80) });
  },
  handlePublishDescInput(event) {
    this.setData({
      publishDraftDesc: this.normalizePublishDescription(event && event.detail ? event.detail.value : "")
    });
  },
  handlePublishToggle(event) {
    const field = event && event.currentTarget && event.currentTarget.dataset
      ? String(event.currentTarget.dataset.field || "")
      : "";
    const value = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.value
      : "";
    if (field === "publishAllowClone" || field === "publishAllowExport") {
      this.setData({ [field]: value !== "false" });
      return;
    }
    if (field === "publishQrLinkType" && (value === "none" || value === "profile")) {
      this.setData({ publishQrLinkType: value });
    }
  },
  handleTopUndo() {
    if (!this.data.canUndo) return;
    this.handleUndo();
  },
  handleTopRedo() {
    if (!this.data.canRedo) return;
    this.handleRedo();
  },
  handleBottomSectionTab(event) {
    const tab = event && event.currentTarget && event.currentTarget.dataset
      ? String(event.currentTarget.dataset.tab || "")
      : "";
    if (tab !== "mard" && tab !== "stats" && tab !== "pick") return;
    if (tab === this.data.bottomSectionTab) {
      if (tab === "pick") this.handleOpenColorPicker();
      return;
    }
    this.setData({ bottomSectionTab: tab }, () => {
      if (tab === "pick") this.handleOpenColorPicker();
    });
  },
  handleOpenColorPicker() {
    if (!this.data.hasEditableGrid) return;
    this.closeEraserMenu();
    this.refreshBeadMetrics();
    this.setData({
      showColorPicker: true,
      showBeadStatsOverlay: false
    });
  },
  handleCloseColorPicker() {
    if (this.data.showColorPicker) {
      this.setData({ showColorPicker: false }, () => this.requestRedraw(false));
    }
  },
  noop() { },
  captureEditorCanvasSnapshot() {
    return new Promise((resolve) => {
      if (!this.canvasReady || !this.data.hasEditableGrid) {
        resolve("");
        return;
      }
      const width = Math.max(1, Math.floor(toNumber(this.data.canvasWidth, 0)));
      const height = Math.max(1, Math.floor(toNumber(this.data.canvasHeight, 0)));
      try {
        wx.canvasToTempFilePath({
          canvasId: "editorCanvas",
          x: 0,
          y: 0,
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: "png",
          quality: 1,
          success: ({ tempFilePath }) => resolve(tempFilePath || ""),
          fail: () => resolve("")
        }, this);
      } catch (error) {
        resolve("");
      }
    });
  },
  handleSwitchViewMode(event) {
    const mode = event.currentTarget.dataset.mode === "bead" ? "bead" : "edit";
    if (mode === this.data.viewMode) return;
    this.closeEraserMenu();
    if (mode === "bead") {
      this.refreshBeadMetrics();
      wx.showToast({
        title: "拼豆模式：点击色块可高亮，横向连续显示计数",
        icon: "none",
        duration: 2200
      });
    }
    this.setData({
      viewMode: mode,
      showMoveShapeOverlay: false
    }, () => {
      this.requestRedraw(false);
    });
  },
  toggleBeadHighlight(index) {
    if (!Number.isFinite(index) || index < 0) return;
    const next = this.data.beadHighlightIndex === index ? -1 : index;
    this.setData({ beadHighlightIndex: next }, () => {
      this.requestRedraw(true);
    });
  },
  handleSelectBeadColor(event) {
    const index = toNumber(event.currentTarget.dataset.index, -1);
    if (index < 0) return;
    // In edit mode, also switch the paint color to the tapped stat color
    if (this.data.viewMode === "edit") {
      const color = this.getPaletteColor(index);
      this.setData({
        selectedColorIndex: index,
        selectedColorCode: color.code,
        selectedColorHex: color.hex
      });
    }
    this.toggleBeadHighlight(index);
  },
  handleToggleBeadStats() {
    if (!Array.isArray(this.data.beadStats) || !this.data.beadStats.length) {
      this.refreshBeadMetrics();
    }
    this.setData({
      showAllBeadStats: true,
      showBeadStatsOverlay: true,
      showColorPicker: false
    });
  },
  handleCloseBeadStatsOverlay() {
    if (!this.data.showBeadStatsOverlay) return;
    this.setData({
      showAllBeadStats: false,
      showBeadStatsOverlay: false
    });
  },
  computeUsedColorStats() {
    const total = this.gridSize * this.gridSize;
    const counter = Object.create(null);
    if (!this.gridSize || !Array.isArray(this.gridIndexes) || this.gridIndexes.length < total) {
      return [];
    }
    for (let i = 0; i < total; i += 1) {
      const idx = this.gridIndexes[i];
      if (this.isBackgroundCell(idx)) continue;
      const key = String(idx);
      counter[key] = (counter[key] || 0) + 1;
    }
    return Object.keys(counter)
      .map((key) => {
        const idx = Number(key);
        const color = this.getPaletteColor(idx);
        return {
          index: idx,
          code: color.code,
          hex: color.hex,
          textColor: this.getTextColorByHex(color.hex),
          count: counter[key],
          order: Number.isFinite(color.order) ? color.order : 9999
        };
      })
      .sort((a, b) => (b.count - a.count) || (a.order - b.order));
  },
  computeBeadStatsAndLabels() {
    const total = this.gridSize * this.gridSize;
    const labels = new Array(total).fill("");
    if (!this.gridSize || !Array.isArray(this.gridIndexes) || this.gridIndexes.length < total) {
      return { stats: [], labels };
    }
    const stats = this.computeUsedColorStats();

    for (let row = 0; row < this.gridSize; row += 1) {
      let col = 0;
      while (col < this.gridSize) {
        const start = row * this.gridSize + col;
        const index = this.gridIndexes[start];
        if (this.isBackgroundCell(index)) {
          col += 1;
          continue;
        }
        let runLength = 1;
        while (col + runLength < this.gridSize) {
          const next = row * this.gridSize + col + runLength;
          if (this.gridIndexes[next] !== index) break;
          runLength += 1;
        }
        labels[start] = this.getPaletteColor(index).code;
        for (let n = 2; n <= runLength; n += 1) {
          labels[start + n - 1] = String(n);
        }
        col += runLength;
      }
    }

    return { stats, labels };
  },
  refreshBeadMetrics() {
    this.backgroundIndexSet = this.computeBackgroundIndexSet();
    const metrics = this.computeBeadStatsAndLabels();
    this.beadCellLabels = metrics.labels;
    const stillExists = metrics.stats.some((item) => item.index === this.data.beadHighlightIndex);
    this.setData({
      beadStats: metrics.stats,
      usedPalette: this.buildPaletteByIndexes(metrics.stats.map((item) => item.index)),
      beadHighlightIndex: stillExists ? this.data.beadHighlightIndex : -1
    });
  },
  getTextColorByIndex(index) {
    const color = this.getPaletteColor(index);
    return this.getTextColorByHex(color && color.hex);
  },
  getTextColorByHex(hexValue) {
    const hex = String(hexValue || "#FFFFFF").replace("#", "");
    if (hex.length !== 6) return "#1F2430";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance <= 126 ? "#FFFFFF" : "#1F2430";
  },
  readWheelDelta(event) {
    const detail = (event && event.detail) || {};
    const deltaRoot = toNumber(event && event.deltaY, NaN);
    if (Number.isFinite(deltaRoot) && deltaRoot !== 0) return deltaRoot;

    const wheelDeltaRoot = toNumber(event && event.wheelDelta, NaN);
    if (Number.isFinite(wheelDeltaRoot) && wheelDeltaRoot !== 0) return -wheelDeltaRoot;

    const deltaY = toNumber(detail.deltaY, NaN);
    if (Number.isFinite(deltaY) && deltaY !== 0) return deltaY;

    const wheelDelta = toNumber(detail.wheelDelta, NaN);
    if (Number.isFinite(wheelDelta) && wheelDelta !== 0) return -wheelDelta;

    const native = (event && event.originalEvent) || {};
    const nativeDeltaY = toNumber(native.deltaY, NaN);
    if (Number.isFinite(nativeDeltaY) && nativeDeltaY !== 0) return nativeDeltaY;

    const nativeWheelDelta = toNumber(native.wheelDelta, NaN);
    if (Number.isFinite(nativeWheelDelta) && nativeWheelDelta !== 0) return -nativeWheelDelta;
    return 0;
  },
  isWheelZoomModifierPressed(event) {
    const detail = (event && event.detail) || {};
    const native = (event && event.originalEvent) || {};
    const textModifiers = [
      detail.modifierKey,
      detail.modifiers,
      detail.keyModifiers,
      native.modifierKey,
      native.modifiers
    ]
      .filter((value) => typeof value === "string")
      .join("|")
      .toLowerCase();
    if (textModifiers.includes("ctrl") || textModifiers.includes("meta") || textModifiers.includes("command") || textModifiers.includes("cmd")) {
      return true;
    }

    const numericModifiers = [
      detail.modifiers,
      detail.keyModifiers,
      native.modifiers
    ].find((value) => typeof value === "number");
    if (Number.isFinite(numericModifiers) && numericModifiers > 0) {
      return true;
    }

    const modValues = [
      detail.ctrlKey,
      detail.metaKey,
      detail.commandKey,
      native.ctrlKey,
      native.metaKey,
      event && event.ctrlKey,
      event && event.metaKey
    ];
    const hasExplicitModifierInfo = modValues.some((value) => typeof value === "boolean");
    if (!hasExplicitModifierInfo) {
      return false;
    }
    return Boolean(modValues.some((value) => value === true));
  },
  forwardWheelScroll(deltaY) {
    const nextTop = Math.max(0, (this.pageScrollTop || 0) + deltaY);
    this.pageScrollTop = nextTop;
    wx.pageScrollTo({
      scrollTop: nextTop,
      duration: 0
    });
  },
  getWheelAnchorCanvasPoint(event) {
    const detail = (event && event.detail) || {};
    const native = (event && event.originalEvent) || {};
    const pageX = toNumber(
      detail.pageX,
      toNumber(detail.x, toNumber(native.pageX, toNumber(native.x, NaN)))
    );
    const pageY = toNumber(
      detail.pageY,
      toNumber(detail.y, toNumber(native.pageY, toNumber(native.y, NaN)))
    );
    if (Number.isFinite(pageX) && Number.isFinite(pageY)) {
      const point = this.toCanvasPoint({ pageX, pageY, clientX: pageX, clientY: pageY });
      if (point) return point;
    }
    return {
      x: this.data.canvasWidth / 2,
      y: this.data.canvasHeight / 2
    };
  },
  handleCanvasMouseWheel(event) {
    if (!this.data.hasEditableGrid) return;
    const deltaY = this.readWheelDelta(event);
    if (!this.isWheelZoomModifierPressed(event)) {
      if (deltaY) this.forwardWheelScroll(deltaY);
      return;
    }
    this.closeEraserMenu();

    if (!deltaY) return;

    const direction = deltaY > 0 ? -1 : 1;
    const step = this.scale >= 2 ? 0.1 : 0.14;
    const { minScale, maxScale } = this.getScaleLimits();
    const nextScale = clamp(this.scale + direction * step, minScale, maxScale);
    if (nextScale === this.scale) return;

    const anchorPoint = this.getWheelAnchorCanvasPoint(event);
    const { drawCell, originX, originY } = this.getBoardMetrics();
    const anchorBoardX = (anchorPoint.x - originX) / drawCell;
    const anchorBoardY = (anchorPoint.y - originY) / drawCell;

    this.interactionMode = "move";
    this.applyScaleWithAnchor(nextScale, anchorPoint, anchorBoardX, anchorBoardY);
    this.requestRedraw(true);

    if (!this.wheelHintShown) {
      this.wheelHintShown = true;
      wx.showToast({
        title: "滚轮缩放已启用",
        icon: "none",
        duration: 1000
      });
    }

    if (this.wheelSettleTimer) clearTimeout(this.wheelSettleTimer);
    this.wheelSettleTimer = setTimeout(() => {
      this.interactionMode = "";
      this.requestRedraw(false);
      this.wheelSettleTimer = null;
    }, 90);
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
  updateExportCanvasSizeAsync(width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    return this.setDataAsync({
      exportCanvasSize: Math.max(safeWidth, safeHeight),
      exportCanvasWidth: safeWidth,
      exportCanvasHeight: safeHeight
    }).then(() => new Promise((resolve) => {
      if (typeof wx.nextTick === "function") {
        wx.nextTick(resolve);
        return;
      }
      setTimeout(resolve, 0);
    })).then(() => this.waitAsync(24));
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
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        },
        this
      );
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
  getProcessingEdgeForTarget(targetEdge) {
    const safe = clamp(parseInt(targetEdge, 10) || 0, MIN_PATTERN_EDGE, MAX_PATTERN_EDGE);
    if (!safe) return 0;
    const factor = safe <= 60 ? 3.2 : (safe <= 80 ? 2.8 : (safe <= 120 ? 2.4 : 2));
    return clamp(Math.round(safe * factor), safe, 400);
  },
  async rebuildGridFromAiPreview(imagePath, gridSize) {
    if (!imagePath || !gridSize) return [];
    let sourceWidth = gridSize;
    let sourceHeight = gridSize;
    try {
      const imageInfo = await this.getImageInfo(imagePath);
      sourceWidth = Number(imageInfo && imageInfo.width) || gridSize;
      sourceHeight = Number(imageInfo && imageInfo.height) || gridSize;
    } catch (error) {
      // ignore and fallback to square source
    }
    const srcRatio = sourceWidth / sourceHeight;
    const rect = computeContainDrawRect(srcRatio, gridSize);

    await this.updateExportCanvasSizeAsync(gridSize, gridSize);
    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, gridSize, gridSize);
      ctx.drawImage(imagePath, rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);
    });
    const sampled = await this.canvasGetImageDataAsync("exportCanvas", gridSize, gridSize);
    const quantized = quantizeToPalette(sampled.data);
    return quantized.hexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = this.paletteIndexByHex[key];
      return Number.isFinite(mapped) ? mapped : 0;
    });
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
      const record = counter[key] || { count: 0, sumR: 0, sumG: 0, sumB: 0 };
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
      return { colors: [{ r: 255, g: 255, b: 255 }], spread: 0 };
    }

    const picked = [];
    let covered = 0;
    const minCount = Math.max(2, Math.floor(total * 0.035));
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (picked.length >= 6) break;
      if (picked.length > 0 && entry.count < minCount) break;
      const duplicate = picked.some((item) => distanceSqRgb(item, entry) <= 28 * 28);
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
        const dist = Math.sqrt(distanceSqRgb(item, entry));
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

    if (keptCount <= 0 || maxX < minX || maxY < minY) return null;

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
  resampleRgbaRegionToTarget(rawPixels, sourceWidth, sourceHeight, bounds, targetWidth, targetHeight, options = {}) {
    const safeTargetW = Math.max(1, Math.floor(targetWidth));
    const safeTargetH = Math.max(1, Math.floor(targetHeight));
    const safeSourceW = Math.max(1, Math.floor(sourceWidth));
    const safeSourceH = Math.max(1, Math.floor(sourceHeight));
    const out = new Uint8ClampedArray(safeTargetW * safeTargetH * 4);
    const backgroundMask = options && options.backgroundMask instanceof Uint8Array
      ? options.backgroundMask
      : null;
    const safeBounds = bounds || { minX: 0, minY: 0, width: safeSourceW, height: safeSourceH };
    const minX = clamp(Math.floor(safeBounds.minX || 0), 0, safeSourceW - 1);
    const minY = clamp(Math.floor(safeBounds.minY || 0), 0, safeSourceH - 1);
    const regionW = clamp(Math.floor(safeBounds.width || safeSourceW), 1, safeSourceW - minX);
    const regionH = clamp(Math.floor(safeBounds.height || safeSourceH), 1, safeSourceH - minY);
    const white = 255;
    const smallTargetBoost = Math.max(0, (40 - Math.max(safeTargetW, safeTargetH)) / 18);
    const toLum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
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
            if (backgroundMask && backgroundMask[sy * safeSourceW + sx]) continue;
            const offset = (sy * safeSourceW + sx) * 4;
            const a = clamp((Number(rawPixels[offset + 3]) || 0) / 255, 0, 1);
            const r = Number(rawPixels[offset]) || 0;
            const g = Number(rawPixels[offset + 1]) || 0;
            const b = Number(rawPixels[offset + 2]) || 0;
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
          continue;
        }

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
  async buildResizeSourceFromImage(imagePath, targetMaxEdge) {
    if (!imagePath) return null;
    const effectiveTarget = clamp(parseInt(targetMaxEdge, 10) || 0, MIN_PATTERN_EDGE, MAX_PATTERN_EDGE);
    if (!effectiveTarget) return null;
    const processingEdge = this.getProcessingEdgeForTarget(effectiveTarget);
    let sourceWidth = processingEdge;
    let sourceHeight = processingEdge;
    try {
      const imageInfo = await this.getImageInfo(imagePath);
      sourceWidth = Number(imageInfo && imageInfo.width) || processingEdge;
      sourceHeight = Number(imageInfo && imageInfo.height) || processingEdge;
    } catch (error) {
      return null;
    }

    const srcRatio = sourceWidth / Math.max(1, sourceHeight);
    const rect = computeContainDrawRect(srcRatio, processingEdge);

    await this.updateExportCanvasSizeAsync(processingEdge, processingEdge);
    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, processingEdge, processingEdge);
      ctx.drawImage(imagePath, rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);
    });
    const sampled = await this.canvasGetImageDataAsync("exportCanvas", processingEdge, processingEdge);
    const quantized = quantizeToPalette(sampled.data);
    const indexGrid = quantized.hexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = this.paletteIndexByHex[key];
      return Number.isFinite(mapped) ? mapped : 0;
    });
    return this.buildResizeSourceFromGrid(indexGrid, processingEdge);
  },
  async buildGridFromSourceImage(imagePath, targetMaxEdge) {
    if (!imagePath) return null;
    const nextGridSize = clamp(parseInt(targetMaxEdge, 10) || 0, MIN_PATTERN_EDGE, MAX_PATTERN_EDGE);
    if (!nextGridSize) return null;
    const processingEdge = this.getProcessingEdgeForTarget(nextGridSize);
    let sourceWidth = processingEdge;
    let sourceHeight = processingEdge;
    try {
      const imageInfo = await this.getImageInfo(imagePath);
      sourceWidth = Number(imageInfo && imageInfo.width) || processingEdge;
      sourceHeight = Number(imageInfo && imageInfo.height) || processingEdge;
    } catch (error) {
      return null;
    }

    const srcRatio = sourceWidth / Math.max(1, sourceHeight);
    const rect = computeContainDrawRect(srcRatio, processingEdge);

    await this.updateExportCanvasSizeAsync(processingEdge, processingEdge);
    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, processingEdge, processingEdge);
      ctx.drawImage(imagePath, rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);
    });
    const sampled = await this.canvasGetImageDataAsync("exportCanvas", processingEdge, processingEdge);
    const rectMinCol = clamp(Math.floor(rect.drawX), 0, processingEdge - 1);
    const rectMinRow = clamp(Math.floor(rect.drawY), 0, processingEdge - 1);
    const rectMaxCol = clamp(Math.ceil(rect.drawX + rect.drawWidth) - 1, rectMinCol, processingEdge - 1);
    const rectMaxRow = clamp(Math.ceil(rect.drawY + rect.drawHeight) - 1, rectMinRow, processingEdge - 1);
    const wholeImportBounds = {
      minX: rectMinCol,
      minY: rectMinRow,
      maxX: rectMaxCol,
      maxY: rectMaxRow,
      width: Math.max(1, rectMaxCol - rectMinCol + 1),
      height: Math.max(1, rectMaxRow - rectMinRow + 1)
    };
    const initialBounds = wholeImportBounds;
    const bgIndex = this.getBackgroundFillIndex();
    const ratio = initialBounds.width / Math.max(1, initialBounds.height);
    let targetW;
    let targetH;
    if (ratio >= 1) {
      targetW = nextGridSize;
      targetH = Math.max(1, Math.round(nextGridSize / Math.max(1e-6, ratio)));
    } else {
      targetH = nextGridSize;
      targetW = Math.max(1, Math.round(nextGridSize * ratio));
    }
    targetW = Math.min(targetW, nextGridSize);
    targetH = Math.min(targetH, nextGridSize);
    this.lastSourceVisibleBounds = {
      gridSize: nextGridSize,
      width: targetW,
      height: targetH
    };
    const rawTargetPixels = this.resampleRgbaRegionToTarget(
      sampled.data,
      processingEdge,
      processingEdge,
      initialBounds,
      targetW,
      targetH,
      {
        backgroundMask: null
      }
    );
    const preparedTargetPixels = this.enhanceFinePixelClarity(rawTargetPixels, targetW, targetH);
    const quantized = quantizeToPalette(preparedTargetPixels);
    const rectScaled = quantized.hexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = this.paletteIndexByHex[key];
      return Number.isFinite(mapped) ? mapped : bgIndex;
    });
    const total = nextGridSize * nextGridSize;
    const output = new Array(total).fill(bgIndex);
    const offsetX = Math.floor((nextGridSize - targetW) / 2);
    const offsetY = Math.floor((nextGridSize - targetH) / 2);
    for (let row = 0; row < targetH; row += 1) {
      for (let col = 0; col < targetW; col += 1) {
        output[(offsetY + row) * nextGridSize + (offsetX + col)] = rectScaled[row * targetW + col];
      }
    }
    return output;
  },
  async buildGridFromBestSource(targetMaxEdge) {
    this.lastSourceVisibleBounds = null;
    const candidates = [];
    if (typeof this.resizeSourceImagePath === "string" && this.resizeSourceImagePath.length) {
      candidates.push(this.resizeSourceImagePath);
    }
    if (Array.isArray(this.resizeSourceImageCandidates) && this.resizeSourceImageCandidates.length) {
      for (let i = 0; i < this.resizeSourceImageCandidates.length; i += 1) {
        const path = this.resizeSourceImageCandidates[i];
        if (typeof path !== "string" || !path.length) continue;
        if (candidates.indexOf(path) >= 0) continue;
        candidates.push(path);
      }
    }
    for (let i = 0; i < candidates.length; i += 1) {
      const path = candidates[i];
      try {
        this.lastSourceVisibleBounds = null;
        const grid = await this.buildGridFromSourceImage(path, targetMaxEdge);
        if (Array.isArray(grid) && grid.length) {
          this.resizeSourceImagePath = path;
          if (!Array.isArray(this.resizeSourceImageCandidates)) this.resizeSourceImageCandidates = [];
          const remained = this.resizeSourceImageCandidates.filter((item) => item !== path);
          this.resizeSourceImageCandidates = [path, ...remained];
          return grid;
        }
      } catch (error) {
        // try next candidate
      }
    }
    return null;
  },
  persistMigratedEditorData(workId, gridSize, indexGrid, originalWork) {
    if (!workId || !gridSize || !Array.isArray(indexGrid) || !indexGrid.length) return;
    const workLibrary = this.readWorkLibrary();
    const targetIndex = workLibrary.findIndex((item) => item && item.id === workId);
    if (targetIndex === -1) return;
    const source = originalWork || workLibrary[targetIndex] || {};
    const sizePair = parseSizePairFromText(source && source.size);
    const fallbackBounds = sizePair
      ? this.buildCenteredVisibleBounds(sizePair.width, sizePair.height, gridSize)
      : null;
    const sourceBounds = this.normalizeVisibleBounds(
      source && source.editorData && source.editorData.visibleBounds,
      gridSize
    ) || fallbackBounds;
    const usedColorIndexes = [...new Set(indexGrid.filter((idx) => Number.isFinite(idx) && idx >= 0))].sort((a, b) => a - b);
    workLibrary[targetIndex] = {
      ...source,
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize,
        indexGridPacked: packIndexGrid(indexGrid, this.palette.length - 1),
        usedColorIndexes,
        backgroundHex: "#FFFFFF",
        userEdited: false,
        paletteVersion: EDITOR_PALETTE_VERSION,
        visibleBounds: sourceBounds ? {
          minCol: sourceBounds.minCol,
          minRow: sourceBounds.minRow,
          maxCol: sourceBounds.maxCol,
          maxRow: sourceBounds.maxRow
        } : undefined
      }
    };
    this.writeWorkLibrary(workLibrary);
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
  readWorkLibrary() {
    const runtime = this.getRuntimeWorkCache();
    if (runtime.length) {
      this.lastWorkLibrarySource = "runtime-cache";
      return runtime;
    }

    let cached = null;
    try {
      cached = wx.getStorageSync(STORAGE_KEY);
      this.lastWorkLibrarySource = "storage-primary";
      if (!Array.isArray(cached) || !cached.length) {
        const backup = wx.getStorageSync(BACKUP_STORAGE_KEY);
        if (Array.isArray(backup) && backup.length) {
          cached = backup;
          this.lastWorkLibrarySource = "storage-backup";
        }
      }
      if ((!Array.isArray(cached) || !cached.length) && LEGACY_STORAGE_KEY) {
        const legacy = wx.getStorageSync(LEGACY_STORAGE_KEY);
        if (Array.isArray(legacy) && legacy.length) {
          cached = legacy;
          this.lastWorkLibrarySource = "storage-legacy";
        }
      }
    } catch (error) {
      console.warn("read work library failed", error);
      this.lastWorkLibrarySource = "storage-error";
    }

    if (!Array.isArray(cached) || !cached.length) {
      this.lastWorkLibrarySource = "empty";
    }
    return Array.isArray(cached) ? cached : [];
  },
  writeWorkLibrary(list) {
    const safeList = Array.isArray(list) ? list : [];
    this.setRuntimeWorkCache(safeList);
    try {
      wx.setStorageSync(STORAGE_KEY, safeList);
      wx.setStorageSync(BACKUP_STORAGE_KEY, safeList);
    } catch (error) {
      console.warn("write work library failed", error);
    }
  },
  getCurrentWorkRecord() {
    if (!this.data.workId) return null;
    const workLibrary = this.readWorkLibrary();
    return workLibrary.find((item) => item && item.id === this.data.workId) || null;
  },
  readPublishedPaperLibrary() {
    try {
      const stored = wx.getStorageSync(PUBLISHED_PAPER_STORAGE_KEY);
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      console.warn("read published paper library failed", error);
      return [];
    }
  },
  writePublishedPaperLibrary(list) {
    const safeList = Array.isArray(list) ? list : [];
    try {
      wx.setStorageSync(PUBLISHED_PAPER_STORAGE_KEY, safeList);
    } catch (error) {
      console.warn("write published paper library failed", error);
    }
  },
  resolvePublishDifficulty(sizeText = "") {
    const edge = parseGridSizeFromText(sizeText) || this.gridSize || 0;
    if (edge <= 36) return "入门";
    if (edge <= 72) return "进阶";
    return "高阶";
  },
  resolvePublishScene(styleText = "") {
    if (String(styleText || "").includes("Q版")) return "Q版创作";
    if (String(styleText || "") === BLANK_CANVAS_STYLE) return "自由创作";
    return "AI创作";
  },
  resolvePublishTone(sizeText = "") {
    const edge = parseGridSizeFromText(sizeText) || this.gridSize || 0;
    if (edge <= 36) return "pink";
    if (edge <= 72) return "orange";
    return "gold";
  },
  buildPublishTheme(workName = "") {
    const safeName = String(workName || "").trim();
    if (!safeName) return "自定义";
    return safeName.length <= 4 ? safeName : safeName.slice(0, 4);
  },
  getGridPreviewCellSize(width, height, withGridLines = false) {
    const baseCell = withGridLines ? 12 : 10;
    const maxEdge = Math.max(1, Math.floor(Math.max(width, height)));
    const maxCanvasEdge = withGridLines ? 2200 : 1800;
    const maxCell = Math.max(1, Math.floor(maxCanvasEdge / maxEdge));
    return clamp(baseCell, 8, maxCell);
  },
  async renderGridPreviewImage(options = {}) {
    if (!this.gridSize || !this.gridIndexes.length) return "";
    const withGridLines = Boolean(options.withGridLines);
    const bounds = Boolean(options.cropToContent)
      ? (this.buildVisibleBoundsAroundContent(
        this.computeGridContentBoundsStrict(this.gridIndexes, this.gridSize)
          || this.computeGridContentBounds(this.gridIndexes, this.gridSize),
        null,
        null,
        this.gridSize
      ) || this.getDisplayBounds())
      : this.getDisplayBounds();
    const width = Math.max(1, bounds.maxCol - bounds.minCol + 1);
    const height = Math.max(1, bounds.maxRow - bounds.minRow + 1);
    const cellSize = this.getGridPreviewCellSize(width, height, withGridLines);
    const canvasWidth = width * cellSize;
    const canvasHeight = height * cellSize;
    await this.updateExportCanvasSizeAsync(canvasWidth, canvasHeight);
    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const srcIndex = (bounds.minRow + row) * this.gridSize + (bounds.minCol + col);
          ctx.setFillStyle(this.cellColorByIndex(this.gridIndexes[srcIndex]));
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
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
    const tempPath = await this.canvasToTempFileAsync("exportCanvas", canvasWidth, canvasHeight);
    return this.ensurePersistentImagePath(
      tempPath,
      `${this.data.workId || "work"}_${withGridLines ? "grid" : "publish"}`
    );
  },
  async buildPublishPreviewImage() {
    return this.renderGridPreviewImage({
      withGridLines: false,
      cropToContent: true
    });
  },
  buildPublishedPaperRecord(work, existingRecord, previewImage = "") {
    const source = work || {};
    const sizeText = String(source.size || this.getPatternSizeText().replace("×", "x") || `${this.gridSize}x${this.gridSize}`);
    const usedColorIndexes = Array.isArray(source.editorData && source.editorData.usedColorIndexes)
      ? source.editorData.usedColorIndexes
      : this.computeUsedColorIndexes();
    const now = Date.now();
    const tags = this.normalizePublishTags(this.data.publishDraftTags);
    const description = this.normalizePublishDescription(this.data.publishDraftDesc);
    const publishTitle = this.normalizePublishTitle(this.data.publishDraftTitle) || source.title || this.data.workName || "未命名图纸";
    return {
      id: existingRecord && existingRecord.id ? existingRecord.id : `pub-${source.id || now}`,
      sourceWorkId: source.id || this.data.workId || "",
      workId: source.id || this.data.workId || "",
      title: publishTitle,
      author: "我的发布",
      avatarText: "我",
      size: sizeText,
      colorCount: usedColorIndexes.length,
      difficulty: this.resolvePublishDifficulty(sizeText),
      scene: this.resolvePublishScene(source.style),
      audience: BLANK_CANVAS_STYLE === source.style
        ? ["拼豆小白", "手工爱好者"]
        : ["手工爱好者"],
      theme: tags[0] || this.buildPublishTheme(publishTitle),
      hot: false,
      views: Number(existingRecord && existingRecord.views) || 0,
      clones: Number(existingRecord && existingRecord.clones) || 0,
      likes: Number(existingRecord && existingRecord.likes) || 0,
      favorites: Number(existingRecord && existingRecord.favorites) || 0,
      official: false,
      createdAt: Number(existingRecord && existingRecord.createdAt) || now,
      publishedAt: now,
      tone: this.resolvePublishTone(sizeText),
      previewImage: previewImage || String(existingRecord && existingRecord.previewImage || ""),
      beadEstimate: source && source.beadEstimate
        ? {
          total: Number(source.beadEstimate.total) || 0,
          colorUsed: Number(source.beadEstimate.colorUsed) || 0
        }
        : null,
      editorData: source && source.editorData
        ? {
          ...source.editorData
        }
        : null,
      isPublishedUserWork: true,
      tags,
      description,
      allowClone: this.data.publishAllowClone !== false,
      allowExport: this.data.publishAllowExport !== false,
      qrLinkType: this.data.publishQrLinkType === "none" ? "none" : "profile",
      publishMeta: {
        title: publishTitle,
        tags,
        tagsText: this.data.publishDraftTags,
        description,
        allowClone: this.data.publishAllowClone !== false,
        allowExport: this.data.publishAllowExport !== false,
        qrLinkType: this.data.publishQrLinkType === "none" ? "none" : "profile"
      }
    };
  },
  async loadWork(workId) {
    if (!workId) {
      wx.showToast({ title: "作品不存在", icon: "none" });
      this.setData({ hasEditableGrid: false });
      return;
    }

    const workLibrary = this.readWorkLibrary();
    const workIndex = workLibrary.findIndex((item) => item && item.id === workId);
    const work = workIndex >= 0 ? workLibrary[workIndex] : null;
    const duplicateCount = workLibrary.reduce((sum, item) => {
      if (!item || item.id !== workId) return sum;
      return sum + 1;
    }, 0);
    this.logLoadDiagnostics("load-start", {
      workId,
      workIndex,
      duplicateCount,
      librarySize: Array.isArray(workLibrary) ? workLibrary.length : 0,
      librarySource: this.lastWorkLibrarySource
    });
    if (!work) {
      wx.showToast({ title: "作品不存在", icon: "none" });
      this.setData({ hasEditableGrid: false });
      return;
    }
    this.resizeSourceImageCandidates = [
      work && work.previewImages && work.previewImages.origin,
      work && work.previewImages && work.previewImages.ai
    ]
      .filter((item) => typeof item === "string" && item.length);
    this.resizeSourceImagePath = this.resizeSourceImageCandidates[0] || "";

    const editorData = work.editorData && typeof work.editorData === "object" ? work.editorData : null;
    const gridSize = toNumber(editorData && editorData.gridSize) || parseGridSizeFromText(work.size);
    const total = gridSize * gridSize;
    const packed = editorData && typeof editorData.indexGridPacked === "string"
      ? editorData.indexGridPacked
      : "";
    const legacyIndexGrid = editorData && Array.isArray(editorData.indexGrid) ? editorData.indexGrid : [];
    let indexGridRaw = packed
      ? unpackIndexGrid(packed, total, this.palette.length - 1)
      : legacyIndexGrid.slice(0, total).map((item) => {
        const idx = toNumber(item, 0);
        if (idx === -1) return -1;
        if (idx < 0 || idx >= this.palette.length) return 0;
        return idx;
      });
    const hasPackedGrid = Boolean(packed && packed.length >= total * 2);
    const hasValidGrid = Array.isArray(indexGridRaw) && indexGridRaw.length >= total;
    const editorVersion = Number(editorData && editorData.version) || 0;
    const isUserEdited = Boolean(editorData && editorData.userEdited);
    const paletteVersion = String((editorData && editorData.paletteVersion) || "");
    const maxEdgeLocked = Boolean(
      (editorData && editorData.maxEdgeLocked)
      || (editorData && editorData.styleMode === "cartoon")
      || String(work && work.style || "").includes("Q版")
    );
    const isBlankCanvas = String(work && work.style || "") === BLANK_CANVAS_STYLE;
    const maxEdgeLockReason = maxEdgeLocked ? "Q版作品暂不支持修改最大边长" : "";
    const shouldLegacyRemap = hasValidGrid
      && hasPackedGrid
      && !paletteVersion
      && this.detectLegacyFine220Indexing(indexGridRaw, gridSize);
    if (shouldLegacyRemap) {
      indexGridRaw = this.remapLegacyFine220ToMard221(indexGridRaw.slice(0, total));
    }
    const detectedBroken = hasValidGrid ? this.looksShiftedToCorner(indexGridRaw, gridSize) : false;
    this.assertLoadGridIntegrity(indexGridRaw, gridSize, "raw");
    this.logLoadDiagnostics("grid-raw", {
      workId,
      workIndex,
      hasPackedGrid,
      hasValidGrid,
      editorVersion,
      isUserEdited,
      paletteVersion,
      detectedBroken,
      grid: this.getGridDiagnostics(indexGridRaw, gridSize)
    });
    // Heavy rebuild should only run when packed grid is missing/invalid.
    // If packed grid exists, trust it and avoid color drift from preview-image re-quantization.
    const shouldTryPreviewRebuild = Boolean(
      work.previewImages && (!hasValidGrid || (!hasPackedGrid && detectedBroken))
    );
    if (shouldTryPreviewRebuild) {
      const candidates = [
        work.previewImages.origin,
        work.previewImages.ai,
        work.previewImages.grid
      ].filter((item) => typeof item === "string" && item.length);
      let rebuiltGrid = null;
      for (let i = 0; i < candidates.length; i += 1) {
        try {
          const rebuilt = await this.rebuildGridFromAiPreview(candidates[i], gridSize);
          if (Array.isArray(rebuilt) && rebuilt.length >= total) {
            rebuiltGrid = this.recenterLegacyGrid(rebuilt.slice(0, total), gridSize);
            break;
          }
        } catch (error) {
          console.warn("rebuild grid from preview failed", error);
        }
      }
      if (rebuiltGrid && rebuiltGrid.length >= total) {
        const needPersist = !hasValidGrid
          || !hasPackedGrid
          || editorVersion < EDITOR_DATA_SCHEMA_VERSION
          || shouldLegacyRemap
          || !areGridEqual(indexGridRaw, rebuiltGrid, total);
        indexGridRaw = rebuiltGrid;
        if (needPersist) {
          this.persistMigratedEditorData(workId, gridSize, rebuiltGrid, work);
        }
      }
    } else if (hasValidGrid && (!hasPackedGrid || editorVersion < EDITOR_DATA_SCHEMA_VERSION || shouldLegacyRemap)) {
      indexGridRaw = this.recenterLegacyGrid(indexGridRaw.slice(0, total), gridSize);
      this.persistMigratedEditorData(workId, gridSize, indexGridRaw, work);
    }

    if (!gridSize || !total || indexGridRaw.length < total) {
      this.setData({ hasEditableGrid: false });
      wx.showToast({ title: "该作品缺少可编辑数据，请重新生成", icon: "none" });
      return;
    }

    const shouldRecenterOnLoad = Boolean(
      !hasPackedGrid
      || shouldLegacyRemap
      || (editorVersion < EDITOR_DATA_SCHEMA_VERSION && !isUserEdited)
      || (detectedBroken && !isUserEdited && !paletteVersion)
    );
    this.gridSize = gridSize;
    this.gridIndexes = shouldRecenterOnLoad
      ? this.recenterLegacyGrid(indexGridRaw.slice(0, total), gridSize)
      : indexGridRaw.slice(0, total);
    this.backgroundIndexSet = this.computeBackgroundIndexSet();
    this.assertLoadGridIntegrity(this.gridIndexes, gridSize, "normalized");
    const savedVisibleBounds = this.normalizeVisibleBounds(
      editorData && editorData.visibleBounds,
      gridSize
    );
    const sizePair = parseSizePairFromText(work && work.size);
    const contentBounds = this.computeGridContentBoundsStrict(this.gridIndexes, gridSize)
      || this.computeGridContentBounds(this.gridIndexes, gridSize);
    const contentAwareBounds = contentBounds
      ? this.buildVisibleBoundsAroundContent(
        contentBounds,
        null,
        null,
        gridSize
      )
      : null;
    const fallbackVisibleBounds = sizePair
      ? this.buildCenteredVisibleBounds(sizePair.width, sizePair.height, gridSize)
      : null;
    this.displayBoundsOverride = this.chooseDisplayBounds({
      savedVisibleBounds,
      contentAwareBounds,
      fallbackVisibleBounds,
      contentBounds,
      gridSize,
      sizePair
    });
    this.logLoadDiagnostics("grid-normalized", {
      workId,
      workIndex,
      shouldRecenterOnLoad,
      displayBoundsOverride: this.displayBoundsOverride || null,
      savedVisibleBounds: savedVisibleBounds || null,
      contentBounds: contentBounds || null,
      contentAwareBounds: contentAwareBounds || null,
      fallbackVisibleBounds: fallbackVisibleBounds || null,
      grid: this.getGridDiagnostics(this.gridIndexes, gridSize)
    });
    this.rebuildResizeMasterFromCurrent();
    this.hasManualEdits = false;
    this.undoStack = [];
    this.redoStack = [];

    const usedStats = this.computeUsedColorStats();
    const initialColor = usedStats.length ? usedStats[0].index : 0;

    // Compute initial pattern max edge from content bounding box
    const initialMaxEdge = this.computePatternMaxEdge();
    const displaySizeText = this.getPatternSizeText();

    const initialEdgeText = String(initialMaxEdge || 0);
    const initialPreset = EDGE_PRESET_LIST.map(String).includes(initialEdgeText)
      ? initialEdgeText
      : "custom";
    this.setData({
      workName: work.title || this.data.workName,
      gridSizeText: displaySizeText,
      hasEditableGrid: true,
      currentTool: isBlankCanvas ? "paint" : this.data.currentTool,
      currentToolLabel: isBlankCanvas ? this.getToolLabel("paint") : this.data.currentToolLabel,
      bottomSectionTab: isBlankCanvas ? "mard" : this.data.bottomSectionTab,
      maxEdgeLocked,
      maxEdgeLockReason,
      usedPalette: this.buildPaletteByIndexes(usedStats.map((item) => item.index)),
      selectedColorIndex: initialColor,
      selectedColorCode: this.getPaletteColor(initialColor).code,
      selectedColorHex: this.getPaletteColor(initialColor).hex,
      patternMaxEdge: initialMaxEdge,
      selectedEditorMaxEdge: initialPreset,
      customEditorMaxEdge: initialPreset === "custom" ? initialEdgeText : "",
      maxEdgeError: ""
    });

    // Only call centerContent() if the canvas has already been measured and initialized.
    // If measureCanvas() hasn't run yet, it will call centerContent() itself in its
    // initEditorCanvas2d.finally() callback (line ~1387) with the correct dimensions.
    // Calling centerContent() here before canvas measurement produces a wrong scale based
    // on the default canvasWidth/canvasHeight (900x900) instead of actual screen dimensions.
    if (this.canvasReady) {
      this.centerContent();
      this.logLoadDiagnostics("post-center", {
        workId,
        workIndex,
        scale: this.scale,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        board: this.getBoardMetrics(this.scale, this.offsetX, this.offsetY)
      });
      this.requestRedraw(false);
    }
    this.syncHistoryState();
    setTimeout(() => {
      if (!this.data.hasEditableGrid) return;
      this.refreshBeadMetrics();
      if (this.data.viewMode === "bead") {
        this.requestRedraw(false);
      }
    }, 0);
  },
  measureCanvas() {
    const query = this.createSelectorQuery();
    query.select(".canvas-stage").boundingClientRect();
    query.exec((res) => {
      const rect = res && res[0] ? res[0] : null;
      if (!rect || !rect.width || !rect.height) return;

      const canvasWidth = clamp(Math.floor(rect.width), 100, MAX_CANVAS_EDGE);
      const canvasHeight = clamp(Math.floor(rect.height), 100, MAX_CANVAS_EDGE);

      this.canvasRect = rect;
      this.canvasRatioX = canvasWidth / rect.width;
      this.canvasRatioY = canvasHeight / rect.height;

      this.setData(
        {
          canvasWidth,
          canvasHeight
        },
        () => {
          this.initEditorCanvas2d(canvasWidth, canvasHeight).finally(() => {
            this.canvasReady = true;
            if (this.data.hasEditableGrid) this.centerContent();
            this.requestRedraw(false);
          });
        }
      );
    });
  },
  getDevicePixelRatio() {
    try {
      if (wx && typeof wx.getWindowInfo === "function") {
        const info = wx.getWindowInfo();
        const ratio = Number(info && info.pixelRatio);
        if (Number.isFinite(ratio) && ratio > 0) return ratio;
      }
    } catch (error) {
      // ignore
    }
    return 1;
  },
  initEditorCanvas2d(canvasWidth, canvasHeight) {
    return new Promise((resolve) => {
      const query = this.createSelectorQuery && this.createSelectorQuery();
      if (!query || typeof query.select !== "function") {
        this.useCanvas2d = false;
        this.editorCanvasNode = null;
        this.editorCtx2d = null;
        if (this.data.canvasCanOverlay) {
          this.setData({ canvasCanOverlay: false });
        }
        resolve();
        return;
      }
      query.select("#editorCanvasNode").fields({ node: true, size: true }, (res) => {
        const node = res && res.node;
        if (!node || typeof node.getContext !== "function") {
          this.useCanvas2d = false;
          this.editorCanvasNode = null;
          this.editorCtx2d = null;
          if (this.data.canvasCanOverlay) {
            this.setData({ canvasCanOverlay: false });
          }
          resolve();
          return;
        }
        const ctx = node.getContext("2d");
        if (!ctx) {
          this.useCanvas2d = false;
          this.editorCanvasNode = null;
          this.editorCtx2d = null;
          if (this.data.canvasCanOverlay) {
            this.setData({ canvasCanOverlay: false });
          }
          resolve();
          return;
        }
        const dpr = this.getDevicePixelRatio();
        const width = Math.max(1, Math.floor(canvasWidth * dpr));
        const height = Math.max(1, Math.floor(canvasHeight * dpr));
        if (node.width !== width) node.width = width;
        if (node.height !== height) node.height = height;
        if (typeof ctx.setTransform === "function") {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        this.useCanvas2d = true;
        this.editorCanvasNode = node;
        this.editorCtx2d = ctx;
        if (!this.data.canvasCanOverlay) {
          this.setData({ canvasCanOverlay: true });
        }
        resolve();
      }).exec();
    });
  },
  getEditorDrawContext() {
    if (this.useCanvas2d && this.editorCtx2d) {
      const raw = this.editorCtx2d;
      return {
        setFillStyle: (value) => { raw.fillStyle = value; },
        fillRect: (x, y, w, h) => raw.fillRect(x, y, w, h),
        beginPath: () => raw.beginPath(),
        setLineWidth: (value) => { raw.lineWidth = value; },
        setStrokeStyle: (value) => { raw.strokeStyle = value; },
        moveTo: (x, y) => raw.moveTo(x, y),
        lineTo: (x, y) => raw.lineTo(x, y),
        stroke: () => raw.stroke(),
        setTextAlign: (value) => { raw.textAlign = value; },
        setTextBaseline: (value) => { raw.textBaseline = value; },
        setFontSize: (value) => {
          const px = Math.max(8, Math.floor(Number(value) || 12));
          raw.font = `${px}px sans-serif`;
        },
        fillText: (text, x, y) => raw.fillText(String(text), x, y),
        drawImage: (...args) => raw.drawImage(...args),
        draw: () => { }
      };
    }
    return wx.createCanvasContext("editorCanvas", this);
  },
  requestRedraw(lightMode = false) {
    if (!this.canvasReady) return;
    if (lightMode) this.lightDrawRequested = true;
    else this.lightDrawRequested = false;
    if (this.redrawTimer) return;
    if (this.lightDrawRequested) {
      const minGap = 16;
      const now = Date.now();
      const elapsed = now - (this.lastLightRedrawAt || 0);
      if (elapsed >= minGap) {
        this.lastLightRedrawAt = now;
        this.lightDrawRequested = false;
        this.redrawCanvas(true);
        return;
      }
      this.redrawTimer = setTimeout(() => {
        const useLight = this.lightDrawRequested;
        this.lightDrawRequested = false;
        this.redrawTimer = null;
        if (useLight) this.lastLightRedrawAt = Date.now();
        this.redrawCanvas(useLight);
      }, minGap - elapsed);
      return;
    }
    this.redrawTimer = setTimeout(() => {
      const useLight = this.lightDrawRequested;
      this.lightDrawRequested = false;
      this.redrawTimer = null;
      this.redrawCanvas(useLight);
    }, 12);
  },
  getPaletteColor(index) {
    if (!Number.isFinite(index) || index < 0 || index >= this.palette.length) {
      return { index: 0, code: this.palette[0].code, hex: this.palette[0].hex };
    }
    return this.palette[index];
  },
  buildPaletteByIndexes(indexes) {
    if (!Array.isArray(indexes)) return [];
    return indexes
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < this.palette.length)
      .map((idx) => this.palette[idx]);
  },
  computeUsedColorIndexes() {
    return [...new Set(this.gridIndexes.filter((idx) => Number.isFinite(idx) && idx >= 0))].sort((a, b) => a - b);
  },
  refreshUsedPalette() {
    const used = this.computeUsedColorStats();
    this.setData({
      usedPalette: this.buildPaletteByIndexes(used.map((item) => item.index))
    });
  },
  handleStageTouchMove() {
    // 拦截画布区域触摸滚动，防止页面随手势上下移动
  },
  updateScaleText(options = {}) {
    const nextPercent = Math.round(this.scale * 100);
    const nextText = `${nextPercent}%`;
    const payload = {};
    const throttleMs = toNumber(options.throttleMs, 0);
    const now = Date.now();
    if (throttleMs > 0 && !options.force) {
      const elapsed = now - (this.lastScaleUiSyncAt || 0);
      if (elapsed < throttleMs) return;
    }
    if (this.data.scaleText !== nextText) payload.scaleText = nextText;
    if (options.syncSlider !== false && this.data.scalePercent !== nextPercent) {
      payload.scalePercent = nextPercent;
    }
    const nextInput = String(nextPercent);
    if (options.syncInput !== false && this.data.scaleInputValue !== nextInput) {
      payload.scaleInputValue = nextInput;
    }
    if (!Object.keys(payload).length) return;
    this.lastScaleUiSyncAt = now;
    this.setData(payload);
  },
  showScaleOverlayHint(options = {}) {
    const hold = Boolean(options.hold);
    const delay = toNumber(options.delay, 650);
    if (this.scaleOverlayTimer) clearTimeout(this.scaleOverlayTimer);
    if (!this.data.showScaleOverlay) this.setData({ showScaleOverlay: true });
    if (hold) return;
    this.scaleOverlayTimer = setTimeout(() => {
      this.setData({ showScaleOverlay: false });
      this.scaleOverlayTimer = null;
    }, Math.max(200, delay));
  },
  centerByGridCenter(scale = 1) {
    const { minScale, maxScale } = this.getScaleLimits();
    const safeScale = clamp(scale, minScale, maxScale);
    this.scale = safeScale;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateScaleText();
  },
  getBaseCell() {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const bounds = this.getDisplayBounds();
    const safeCols = Math.max(1, Number(bounds && bounds.cols) || 1);
    const safeRows = Math.max(1, Number(bounds && bounds.rows) || 1);
    const usableWidth = Math.max(80, canvasWidth - 24);
    const usableHeight = Math.max(80, canvasHeight - 24);
    // Fit by real width/height ratio instead of square max-edge to avoid
    // opening non-square patterns with large blank areas.
    return Math.max(1, Math.min(usableWidth / safeCols, usableHeight / safeRows));
  },
  getScaleLimits() {
    const baseCell = this.getBaseCell();
    const canvasEdge = Math.min(this.data.canvasWidth, this.data.canvasHeight);
    const maxScale = Math.max(1, canvasEdge / (baseCell * 3));
    return { minScale: 0.12, maxScale };
  },
  clampOffset() {
    const { canvasWidth, canvasHeight } = this.data;
    const bounds = this.getDisplayBounds();
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(1, baseCell * this.scale);
    const boardWidth = drawCell * bounds.cols;
    const boardHeight = drawCell * bounds.rows;
    // Allow up to ~70% outside stage: keep at least 30% of board visible.
    const minVisibleWidth = Math.max(1, Math.min(boardWidth, canvasWidth, boardWidth * EDITOR_MIN_VISIBLE_RATIO));
    const minVisibleHeight = Math.max(1, Math.min(boardHeight, canvasHeight, boardHeight * EDITOR_MIN_VISIBLE_RATIO));
    const maxOX = Math.max(0, (canvasWidth + boardWidth) / 2 - minVisibleWidth);
    const maxOY = Math.max(0, (canvasHeight + boardHeight) / 2 - minVisibleHeight);
    this.offsetX = clamp(this.offsetX, -maxOX, maxOX);
    this.offsetY = clamp(this.offsetY, -maxOY, maxOY);
  },
  getDisplayBounds() {
    const override = this.normalizeVisibleBounds(this.displayBoundsOverride, this.gridSize);
    if (override) return override;
    const size = this.gridSize || 0;
    if (!size) {
      return {
        minCol: 0,
        minRow: 0,
        maxCol: 0,
        maxRow: 0,
        cols: 1,
        rows: 1
      };
    }
    // Always display the full canvas to avoid any accidental auto-cropping.
    return {
      minCol: 0,
      minRow: 0,
      maxCol: size - 1,
      maxRow: size - 1,
      cols: size,
      rows: size
    };
  },
  getBoardMetrics(scale = this.scale, offsetX = this.offsetX, offsetY = this.offsetY) {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const bounds = this.getDisplayBounds();
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(1, baseCell * scale);
    const boardWidth = drawCell * bounds.cols;
    const boardHeight = drawCell * bounds.rows;
    const originX = (canvasWidth - boardWidth) / 2 + offsetX;
    const originY = (canvasHeight - boardHeight) / 2 + offsetY;
    return {
      drawCell,
      boardWidth,
      boardHeight,
      originX,
      originY,
      bounds,
      canvasWidth,
      canvasHeight
    };
  },
  cellColorByIndex(index) {
    if (!Number.isFinite(index) || index < 0) return "#FFFFFF";
    const palette = this.getPaletteColor(index);
    return palette.hex || "#FFFFFF";
  },
  isNearWhiteByIndex(index) {
    if (!Number.isFinite(index) || index < 0) return true;
    const color = this.getPaletteColor(index);
    const hex = String((color && color.hex) || "#FFFFFF").replace("#", "");
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return r >= 210 && g >= 210 && b >= 210;
  },
  getDominantBorderIndex(indexGrid, size) {
    if (!Array.isArray(indexGrid) || !size) return 0;
    const counter = Object.create(null);
    const push = (idx) => {
      const key = String(Number.isFinite(idx) ? idx : 0);
      counter[key] = (counter[key] || 0) + 1;
    };
    for (let x = 0; x < size; x += 1) {
      push(indexGrid[x]);
      push(indexGrid[(size - 1) * size + x]);
    }
    for (let y = 1; y < size - 1; y += 1) {
      push(indexGrid[y * size]);
      push(indexGrid[y * size + (size - 1)]);
    }
    let bestIndex = 0;
    let bestCount = -1;
    Object.keys(counter).forEach((key) => {
      const count = counter[key];
      if (count > bestCount) {
        bestCount = count;
        bestIndex = Number(key);
      }
    });
    return Number.isFinite(bestIndex) ? bestIndex : 0;
  },
  recenterLegacyGrid(indexGrid, size) {
    if (!Array.isArray(indexGrid) || !size) return indexGrid;
    const total = size * size;
    if (indexGrid.length < total) return indexGrid;

    let minCol = size;
    let minRow = size;
    let maxCol = -1;
    let maxRow = -1;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const idx = indexGrid[row * size + col];
        if (!Number.isFinite(idx) || idx < 0 || this.isNearWhiteByIndex(idx)) continue;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }
    if (maxCol < minCol || maxRow < minRow) return indexGrid;

    const centerCol = (minCol + maxCol + 1) / 2;
    const centerRow = (minRow + maxRow + 1) / 2;
    const target = size / 2;
    const shiftCol = Math.round(target - centerCol);
    const shiftRow = Math.round(target - centerRow);
    if (!shiftCol && !shiftRow) return indexGrid;

    const bgIndex = this.getDominantBorderIndex(indexGrid, size);
    const output = new Array(total).fill(bgIndex);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const idx = indexGrid[row * size + col];
        // Shift the full indexed grid to avoid dropping light colors (e.g. eyes/highlights)
        // that may be near-white but are still intentional foreground details.
        if (!Number.isFinite(idx) || idx < 0) continue;
        const nextCol = col + shiftCol;
        const nextRow = row + shiftRow;
        if (nextCol < 0 || nextRow < 0 || nextCol >= size || nextRow >= size) continue;
        output[nextRow * size + nextCol] = idx;
      }
    }
    return output;
  },
  computePatternMaxEdge() {
    const size = this.gridSize;
    return size || 0;
  },
  getPatternSizeFromBounds(bounds) {
    if (!bounds) {
      const fallback = Math.max(1, this.gridSize || 0);
      return { width: fallback, height: fallback };
    }
    return {
      width: Math.max(1, bounds.maxCol - bounds.minCol + 1),
      height: Math.max(1, bounds.maxRow - bounds.minRow + 1)
    };
  },
  getPatternSizeText() {
    const size = Number(this.gridSize) || 0;
    if (!size) return "--";
    const bounds = this.getDisplayBounds();
    const pair = this.getPatternSizeFromBounds(bounds);
    return `${pair.width}×${pair.height}`;
  },
  openCustomEdgeInputModal() {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    const pair = parseSizePairFromText(this.data.gridSizeText || "");
    const fallbackEdge = Math.max(
      Number(pair && pair.width) || 0,
      Number(pair && pair.height) || 0,
      Number(this.data.patternMaxEdge) || 0,
      this.gridSize || 0,
      MIN_PATTERN_EDGE
    );
    wx.showModal({
      title: "设置图案最大边长",
      content: "",
      editable: true,
      placeholderText: `请输入${MIN_PATTERN_EDGE}-${MAX_PATTERN_EDGE}`,
      confirmText: "应用",
      success: ({ confirm, content }) => {
        if (!confirm) return;
        let val = parseInt(String(content || "").trim(), 10);
        if (!Number.isFinite(val)) {
          val = clamp(fallbackEdge, MIN_PATTERN_EDGE, MAX_PATTERN_EDGE);
        }
        if (val < MIN_PATTERN_EDGE || val > MAX_PATTERN_EDGE) {
          wx.showToast({
            title: `请输入${MIN_PATTERN_EDGE}-${MAX_PATTERN_EDGE}的整数`,
            icon: "none"
          });
          return;
        }
        this.setData({
          selectedEditorMaxEdge: EDGE_PRESET_LIST.includes(val) ? String(val) : "custom",
          customEditorMaxEdge: EDGE_PRESET_LIST.includes(val) ? "" : String(val),
          maxEdgeError: "",
          showEdgePicker: false
        });
        this.applyMaxEdgeChange(val);
      },
      fail: () => {
        wx.showToast({ title: "当前版本暂不支持输入边长", icon: "none" });
      }
    });
  },
  handleTapSizeChip() {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    this.handleCloseBeadStatsOverlay();
    if (this.data.showEdgePicker) {
      this.handleCloseEdgePicker();
      return;
    }
    this.edgePickerCloseLocked = true;
    if (this.edgePickerLockTimer) {
      clearTimeout(this.edgePickerLockTimer);
      this.edgePickerLockTimer = null;
    }
    this.edgePickerLockTimer = setTimeout(() => {
      this.edgePickerCloseLocked = false;
      this.edgePickerLockTimer = null;
    }, 360);
    this.setData({
      showEdgePicker: true,
      edgePickerStyle: ""
    });
  },
  rpxToPx(rpx) {
    return ((Number(rpx) || 0) * (Number(this.windowWidth) || 375)) / 750;
  },
  buildEdgePickerStyle(anchorRect) {
    const screenWidth = Math.max(320, Number(this.windowWidth) || 375);
    const sidePadding = Math.max(8, Math.round(this.rpxToPx(8)));
    const nearGap = Math.max(2, Math.round(this.rpxToPx(2)));
    const panelWidth = Math.max(
      220,
      Math.min(Math.round(this.rpxToPx(500)), screenWidth - sidePadding * 2)
    );

    let left = sidePadding;
    let top = Math.round(this.rpxToPx(154));
    if (
      anchorRect &&
      Number.isFinite(anchorRect.left) &&
      Number.isFinite(anchorRect.bottom)
    ) {
      left = clamp(
        Math.round(anchorRect.left),
        sidePadding,
        Math.max(sidePadding, screenWidth - panelWidth - sidePadding)
      );
      top = Math.max(sidePadding, Math.round(anchorRect.bottom + nearGap));
    }
    return `left:${left}px;top:${top}px;width:${panelWidth}px;`;
  },
  openEdgePickerNearSizeChip() {
    const fallbackStyle = this.buildEdgePickerStyle(null);
    const query = this.createSelectorQuery && this.createSelectorQuery();
    if (!query || typeof query.select !== "function") {
      this.setData({ showEdgePicker: true, edgePickerStyle: fallbackStyle });
      return;
    }
    query.select(".size-chip-clickable").boundingClientRect();
    query.exec((res) => {
      const rect = Array.isArray(res) && res[0] ? res[0] : null;
      this.setData({
        showEdgePicker: true,
        edgePickerStyle: this.buildEdgePickerStyle(rect)
      });
    });
  },
  handleCloseEdgePicker() {
    if (!this.data.showEdgePicker) return;
    if (this.edgePickerCloseLocked) return;
    this.setData({ showEdgePicker: false });
  },
  handleSelectEdgePreset(event) {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    const edge = parseInt(event.currentTarget.dataset.edge, 10);
    if (!Number.isFinite(edge)) return;
    this.setData({
      selectedEditorMaxEdge: String(edge),
      customEditorMaxEdge: "",
      maxEdgeError: "",
      showEdgePicker: false
    });
    this.applyMaxEdgeChange(edge);
  },
  handleOpenCustomEdgeInput() {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    this.openCustomEdgeInputModal();
  },
  handleSelectEditorMaxEdge(event) {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    const mode = event.currentTarget.dataset.mode;
    if (!mode) return;
    this.setData({ selectedEditorMaxEdge: mode, maxEdgeError: "" });
    if (mode !== "custom") {
      const newMaxEdge = parseInt(mode, 10);
      if (Number.isFinite(newMaxEdge) && newMaxEdge > 0) {
        this.applyMaxEdgeChange(newMaxEdge);
      }
    }
  },
  handleCustomEditorMaxEdgeInput(event) {
    if (this.data.maxEdgeLocked) return;
    this.setData({ customEditorMaxEdge: event.detail.value || "", maxEdgeError: "" });
  },
  handleApplyCustomMaxEdge() {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    const val = parseInt(this.data.customEditorMaxEdge, 10);
    if (!Number.isFinite(val) || val < MIN_PATTERN_EDGE || val > MAX_PATTERN_EDGE) {
      this.setData({ maxEdgeError: `请输入${MIN_PATTERN_EDGE}-${MAX_PATTERN_EDGE}的整数` });
      return;
    }
    this.applyMaxEdgeChange(val);
  },
  resampleIndexGridSmart(sourceGrid, sourceWidth, sourceHeight, targetWidth, targetHeight, bgIndex) {
    const output = new Array(targetWidth * targetHeight);
    const upscale = targetWidth >= sourceWidth && targetHeight >= sourceHeight;
    const candidateSet = Object.create(null);
    candidateSet[String(bgIndex)] = true;
    for (let i = 0; i < sourceGrid.length; i += 1) {
      const idx = sourceGrid[i];
      if (!Number.isFinite(idx) || idx < 0) continue;
      candidateSet[String(idx)] = true;
    }
    const candidates = Object.keys(candidateSet)
      .map((key) => Number(key))
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < this.palette.length);

    if (upscale) {
      for (let row = 0; row < targetHeight; row += 1) {
        const srcRow = Math.min(sourceHeight - 1, Math.floor(row * sourceHeight / targetHeight));
        for (let col = 0; col < targetWidth; col += 1) {
          const srcCol = Math.min(sourceWidth - 1, Math.floor(col * sourceWidth / targetWidth));
          output[row * targetWidth + col] = sourceGrid[srcRow * sourceWidth + srcCol];
        }
      }
      return output;
    }

    for (let row = 0; row < targetHeight; row += 1) {
      const sy0 = row * sourceHeight / targetHeight;
      const sy1 = (row + 1) * sourceHeight / targetHeight;
      const yStart = Math.floor(sy0);
      let yEnd = Math.ceil(sy1) - 1;
      if (yEnd < yStart) yEnd = yStart;
      for (let col = 0; col < targetWidth; col += 1) {
        const sx0 = col * sourceWidth / targetWidth;
        const sx1 = (col + 1) * sourceWidth / targetWidth;
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

            const idx = sourceGrid[sy * sourceWidth + sx];
            if (!Number.isFinite(idx) || idx < 0 || idx === bgIndex) {
              bgWeight += weight;
              continue;
            }
            const rgb = (this.getPaletteColor(idx) && this.getPaletteColor(idx).rgb) || { r: 255, g: 255, b: 255 };
            fgWeight += weight;
            sumR += rgb.r * weight;
            sumG += rgb.g * weight;
            sumB += rgb.b * weight;
            const key = String(idx);
            colorWeights[key] = (colorWeights[key] || 0) + weight;
          }
        }

        const centerSrcX = Math.min(sourceWidth - 1, Math.max(0, Math.floor((sx0 + sx1) / 2)));
        const centerSrcY = Math.min(sourceHeight - 1, Math.max(0, Math.floor((sy0 + sy1) / 2)));
        const centerIndex = sourceGrid[centerSrcY * sourceWidth + centerSrcX];
        const totalWeight = fgWeight + bgWeight;
        const fgCoverage = totalWeight > 0 ? (fgWeight / totalWeight) : 0;
        if (fgWeight <= 0) {
          output[row * targetWidth + col] = bgIndex;
          continue;
        }
        // Keep tiny details (e.g. eyes/highlights) from being swallowed by background color.
        if (
          fgCoverage < 0.12
          && Number.isFinite(centerIndex)
          && centerIndex >= 0
          && centerIndex !== bgIndex
        ) {
          output[row * targetWidth + col] = centerIndex;
          continue;
        }
        if (fgCoverage < 0.12) {
          output[row * targetWidth + col] = bgIndex;
          continue;
        }

        let targetRgb = {
          r: sumR / fgWeight,
          g: sumG / fgWeight,
          b: sumB / fgWeight
        };
        const centerSupport = colorWeights[String(centerIndex)] || 0;
        if (Number.isFinite(centerIndex) && centerIndex >= 0 && centerIndex !== bgIndex && centerSupport > 0 && fgCoverage < 0.45) {
          output[row * targetWidth + col] = centerIndex;
          continue;
        }
        if (Number.isFinite(centerIndex) && centerIndex >= 0 && centerIndex !== bgIndex) {
          const centerRgb = (this.getPaletteColor(centerIndex) && this.getPaletteColor(centerIndex).rgb) || targetRgb;
          targetRgb = {
            r: targetRgb.r * 0.72 + centerRgb.r * 0.28,
            g: targetRgb.g * 0.72 + centerRgb.g * 0.28,
            b: targetRgb.b * 0.72 + centerRgb.b * 0.28
          };
        }

        let best = bgIndex;
        let bestScore = Number.POSITIVE_INFINITY;

        let minLuma = 255;
        for (const key in colorWeights) {
          const support = colorWeights[key];
          const idx = Number(key);
          if (idx === bgIndex) continue;
          if (support >= 0.8) {
            const color = this.getPaletteColor(idx);
            const rgb = color && color.rgb ? color.rgb : parseHexRgb(color && color.hex);
            const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
            if (luma < minLuma) minLuma = luma;
          }
        }
        const targetLuma = 0.299 * targetRgb.r + 0.587 * targetRgb.g + 0.114 * targetRgb.b;

        for (let i = 0; i < candidates.length; i += 1) {
          const idx = candidates[i];
          if (idx === bgIndex) continue;
          const color = this.getPaletteColor(idx);
          const rgb = color && color.rgb ? color.rgb : parseHexRgb(color && color.hex);
          const dist = distanceSqRgb(targetRgb, rgb);
          const support = colorWeights[String(idx)] || 0;
          const centerBonus = idx === centerIndex ? 0.16 : 0;

          let edgeBonus = 0;
          const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
          // Outline preservation: if this color is the local darkest color, is significantly darker 
          // than average, and has some solid support (>0.8 pixels), boost it aggressively.
          if (support >= 0.8 && luma <= minLuma + 5 && luma < targetLuma - 12 && luma < 95) {
            edgeBonus = 40000 + support * 12000;
          }

          const score = dist - support * 2200 - centerBonus * 1800 - edgeBonus;
          if (score < bestScore) {
            bestScore = score;
            best = idx;
          }
        }
        output[row * targetWidth + col] = Number.isFinite(best) ? best : bgIndex;
      }
    }
    return output;
  },
  buildResizeSourceFromGrid(indexGrid, size) {
    if (!Array.isArray(indexGrid) || !size || indexGrid.length < size * size) return null;
    const resizeBgSet = this.buildResizeBackgroundSet(indexGrid, size);
    const isResizeBackground = (idx) => {
      if (!Number.isFinite(idx) || idx < 0) return true;
      if (resizeBgSet[String(idx)]) return true;
      return false;
    };
    // Keep all non-background pixels in source bounds.
    // Do not restrict to largest connected region, otherwise detached details
    // (e.g. star, motion lines, horn marks) are lost when resizing.
    const bounds = this.computeGridContentBoundsWithChecker(indexGrid, size, isResizeBackground);
    if (!bounds) return null;

    const width = bounds.maxCol - bounds.minCol + 1;
    const height = bounds.maxRow - bounds.minRow + 1;
    const bgIndex = this.getBackgroundFillIndex();
    const rectGrid = new Array(width * height).fill(bgIndex);
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const srcIndex = (bounds.minRow + row) * size + (bounds.minCol + col);
        const color = indexGrid[srcIndex];
        if (isResizeBackground(color)) continue;
        rectGrid[row * width + col] = color;
      }
    }

    return {
      rectGrid,
      width,
      height,
      bgIndex
    };
  },
  rebuildResizeMasterFromCurrent() {
    this.resizeMaster = this.buildResizeSourceFromGrid(this.gridIndexes, this.gridSize);
  },
  applyMaxEdgeChange(newMaxEdge, options = {}) {
    if (this.data.maxEdgeLocked) {
      wx.showToast({ title: this.data.maxEdgeLockReason || "Q版作品暂不支持修改最大边长", icon: "none" });
      return;
    }
    const parsedEdge = parseInt(newMaxEdge, 10);
    if (!Number.isFinite(parsedEdge)) return;
    if (parsedEdge < MIN_PATTERN_EDGE || parsedEdge > MAX_PATTERN_EDGE) {
      this.setData({ maxEdgeError: `边长范围为 ${MIN_PATTERN_EDGE}-${MAX_PATTERN_EDGE}` });
      return;
    }
    const fromSource = Boolean(options && options.fromSource);
    const hasProvidedGrid = Boolean(
      options
      && Array.isArray(options.sourceGrid)
      && options.sourceGrid.length >= parsedEdge * parsedEdge
    );

    if (!fromSource && !this.hasManualEdits && this.resizeSourceImagePath) {
      this.pendingSourceMaxEdge = parsedEdge;
      if (this.sourceResizeBusy) return;
      this.sourceResizeBusy = true;
      wx.showLoading({ title: "按原图重算中...", mask: true });
      const run = async () => {
        while (Number.isFinite(this.pendingSourceMaxEdge)) {
          const nextEdge = this.pendingSourceMaxEdge;
          this.pendingSourceMaxEdge = null;
          let sourceGrid = null;
          try {
            sourceGrid = await this.buildGridFromBestSource(nextEdge);
          } catch (error) {
            sourceGrid = null;
          }
          this.applyMaxEdgeChange(nextEdge, { fromSource: true, sourceGrid });
        }
      };
      run().finally(() => {
        this.sourceResizeBusy = false;
        try {
          wx.hideLoading();
        } catch (error) {
          // ignore
        }
      });
      return;
    }

    const gridSize = this.gridSize;
    if (!gridSize || !Array.isArray(this.gridIndexes)) return;
    const previousBounds = this.getDisplayBounds();
    const previousDisplayWidth = previousBounds.cols;
    const previousDisplayHeight = previousBounds.rows;
    const nextGridSize = clamp(parsedEdge, MIN_PATTERN_EDGE, MAX_PATTERN_EDGE);
    if (nextGridSize === this.gridSize) {
      this.setData({
        patternMaxEdge: this.computePatternMaxEdge() || nextGridSize,
        maxEdgeError: ""
      });
      return;
    }

    const nextTotal = nextGridSize * nextGridSize;
    let newGrid = null;
    if (hasProvidedGrid) {
      newGrid = options.sourceGrid.slice(0, nextTotal);
    } else {
      // Fallback path: scale current canvas when source image is unavailable.
      const bgIndex = this.getBackgroundFillIndex();
      const scaledGrid = this.resampleIndexGridSmart(
        this.gridIndexes,
        gridSize,
        gridSize,
        nextGridSize,
        nextGridSize,
        bgIndex
      );
      newGrid = Array.isArray(scaledGrid) && scaledGrid.length >= nextTotal
        ? scaledGrid.slice(0, nextTotal)
        : new Array(nextTotal).fill(bgIndex);
    }

    const sizeChanged = nextGridSize !== this.gridSize;
    if (!sizeChanged) {
      const patch = [];
      for (let i = 0; i < newGrid.length; i += 1) {
        if (this.gridIndexes[i] !== newGrid[i]) {
          patch.push({ index: i, from: this.gridIndexes[i], to: newGrid[i] });
        }
      }
      if (patch.length) {
        this.undoStack.push(patch);
        if (this.undoStack.length > MAX_UNDO_STEPS) {
          this.undoStack.shift();
        }
        this.redoStack = [];
      }
    } else {
      this.undoStack = [];
      this.redoStack = [];
    }

    this.gridSize = nextGridSize;
    this.gridIndexes = newGrid;
    if (
      fromSource
      && hasProvidedGrid
      && this.lastSourceVisibleBounds
      && this.lastSourceVisibleBounds.gridSize === nextGridSize
    ) {
      this.displayBoundsOverride = this.buildCenteredVisibleBounds(
        this.lastSourceVisibleBounds.width,
        this.lastSourceVisibleBounds.height,
        nextGridSize
      );
    } else if (this.displayBoundsOverride || previousDisplayWidth !== gridSize || previousDisplayHeight !== gridSize) {
      this.displayBoundsOverride = this.buildVisibleBoundsByRatio(
        previousDisplayWidth,
        previousDisplayHeight,
        nextGridSize
      );
    }
    this.hasManualEdits = !fromSource;
    this.backgroundIndexSet = this.computeBackgroundIndexSet();
    this.refreshBeadMetrics();
    this.centerContent();

    const used = this.computeUsedColorStats();
    const computedEdge = this.computePatternMaxEdge();
    const edgeLabel = String(nextGridSize);
    const presetEdge = EDGE_PRESET_LIST.map(String).includes(edgeLabel) ? edgeLabel : "custom";
    this.setData({
      patternMaxEdge: computedEdge || nextGridSize,
      selectedEditorMaxEdge: presetEdge,
      customEditorMaxEdge: presetEdge === "custom" ? edgeLabel : "",
      gridSizeText: this.getPatternSizeText(),
      maxEdgeError: "",
      usedPalette: this.buildPaletteByIndexes(used.map((item) => item.index))
    });
    this.syncHistoryState();
    this.requestRedraw(false);
    this.schedulePersist();
  },
  computeGridContentBounds(indexGrid, size) {
    if (!Array.isArray(indexGrid) || !size) return null;
    let minCol = size;
    let minRow = size;
    let maxCol = -1;
    let maxRow = -1;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const idx = indexGrid[row * size + col];
        if (!Number.isFinite(idx) || idx < 0 || this.isNearWhiteByIndex(idx)) continue;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }
    if (maxCol < minCol || maxRow < minRow) return null;
    return { minCol, minRow, maxCol, maxRow };
  },
  computeGridContentBoundsStrict(indexGrid, size) {
    return this.computeGridContentBoundsWithChecker(indexGrid, size, (idx) => this.isBackgroundCell(idx));
  },
  computeGridContentBoundsWithChecker(indexGrid, size, checker) {
    if (!Array.isArray(indexGrid) || !size) return null;
    const isBackground = typeof checker === "function"
      ? checker
      : (idx) => this.isBackgroundCell(idx);
    let minCol = size;
    let minRow = size;
    let maxCol = -1;
    let maxRow = -1;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const idx = indexGrid[row * size + col];
        if (isBackground(idx)) continue;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }
    if (maxCol < minCol || maxRow < minRow) return null;
    return { minCol, minRow, maxCol, maxRow };
  },
  buildResizeBackgroundSet(indexGrid, size) {
    const set = Object.create(null);
    if (!Array.isArray(indexGrid) || !size || indexGrid.length < size * size) return set;
    set["-1"] = true;
    const counter = Object.create(null);
    const push = (idx) => {
      const key = String(idx);
      counter[key] = (counter[key] || 0) + 1;
      if (this.isNearWhiteByIndex(idx)) set[key] = true;
    };
    for (let x = 0; x < size; x += 1) {
      push(indexGrid[x]);
      push(indexGrid[(size - 1) * size + x]);
    }
    for (let y = 1; y < size - 1; y += 1) {
      push(indexGrid[y * size]);
      push(indexGrid[y * size + (size - 1)]);
    }
    const entries = Object.keys(counter).map((key) => ({
      index: Number(key),
      count: counter[key]
    })).sort((a, b) => b.count - a.count);
    if (entries.length) {
      const borderTotal = size * 4 - 4;
      const top = entries[0];
      // 让边缘主色在缩放时参与背景判断，去掉围绕主体的杂背景。
      if (top && top.count >= Math.max(6, Math.floor(borderTotal * 0.18))) {
        set[String(top.index)] = true;
      }
      for (let i = 1; i < entries.length && i < 3; i += 1) {
        const item = entries[i];
        if (item.count >= Math.max(5, Math.floor(top.count * 0.42)) && this.isNearWhiteByIndex(item.index)) {
          set[String(item.index)] = true;
        }
      }
    }
    return set;
  },
  computePrimaryContentRegion(indexGrid, size, checker = null) {
    if (!Array.isArray(indexGrid) || !size || indexGrid.length < size * size) return null;
    const total = size * size;
    const isBackground = typeof checker === "function"
      ? checker
      : (idx) => this.isBackgroundCell(idx);
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let bestCount = 0;
    let bestBounds = null;
    let bestCells = null;

    for (let start = 0; start < total; start += 1) {
      if (visited[start]) continue;
      const startColor = indexGrid[start];
      if (isBackground(startColor)) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let count = 0;
      let minCol = size;
      let minRow = size;
      let maxCol = -1;
      let maxRow = -1;
      const cells = [];

      while (head < tail) {
        const current = queue[head++];
        const color = indexGrid[current];
        if (isBackground(color)) continue;
        const row = Math.floor(current / size);
        const col = current - row * size;
        cells.push(current);
        count += 1;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;

        if (col > 0) {
          const left = current - 1;
          if (!visited[left] && !isBackground(indexGrid[left])) {
            visited[left] = 1;
            queue[tail++] = left;
          }
        }
        if (col < size - 1) {
          const right = current + 1;
          if (!visited[right] && !isBackground(indexGrid[right])) {
            visited[right] = 1;
            queue[tail++] = right;
          }
        }
        if (row > 0) {
          const up = current - size;
          if (!visited[up] && !isBackground(indexGrid[up])) {
            visited[up] = 1;
            queue[tail++] = up;
          }
        }
        if (row < size - 1) {
          const down = current + size;
          if (!visited[down] && !isBackground(indexGrid[down])) {
            visited[down] = 1;
            queue[tail++] = down;
          }
        }
      }

      if (count > bestCount) {
        bestCount = count;
        bestBounds = { minCol, minRow, maxCol, maxRow };
        bestCells = cells;
      }
    }

    if (!bestBounds || !bestCount) return null;
    const mask = new Uint8Array(total);
    for (let i = 0; i < bestCells.length; i += 1) {
      mask[bestCells[i]] = 1;
    }
    return {
      bounds: bestBounds,
      mask
    };
  },
  looksShiftedToCorner(indexGrid, size) {
    const bounds = this.computeGridContentBounds(indexGrid, size);
    if (!bounds) return false;
    const edge = Math.max(1, Math.floor(size * 0.03));
    const right = bounds.maxCol >= size - 1 - edge;
    const left = bounds.minCol <= edge;
    const bottom = bounds.maxRow >= size - 1 - edge;
    const top = bounds.minRow <= edge;
    const centerCol = (bounds.minCol + bounds.maxCol + 1) / 2;
    const centerRow = (bounds.minRow + bounds.maxRow + 1) / 2;
    const target = size / 2;
    const offsetCol = Math.abs(centerCol - target);
    const offsetRow = Math.abs(centerRow - target);
    const largeOffset = offsetCol >= size * 0.16 || offsetRow >= size * 0.16;
    const cornerTouch = (right && bottom) || (right && top) || (left && bottom) || (left && top);
    return cornerTouch && largeOffset;
  },
  detectLegacyFine220Indexing(indexGrid, size) {
    if (!Array.isArray(indexGrid) || !size) return false;
    const total = size * size;
    if (!total || indexGrid.length < total) return false;
    const counter = Object.create(null);
    for (let i = 0; i < total; i += 1) {
      const idx = Number(indexGrid[i]);
      if (!Number.isFinite(idx) || idx < 0) continue;
      counter[idx] = (counter[idx] || 0) + 1;
    }
    const c183 = counter[183] || 0;
    const c184 = counter[184] || 0;
    const c220 = counter[220] || 0;
    if (!c183 || c220 > 0) return false;
    if (c183 >= Math.max(8, c184 * 1.6)) return true;
    const borderDominant = this.getDominantBorderIndex(indexGrid, size);
    return borderDominant === 183 && c184 <= c183 * 0.25;
  },
  remapLegacyFine220ToMard221(indexGrid) {
    if (!Array.isArray(indexGrid) || !indexGrid.length) return indexGrid;
    const maxIndex = this.palette.length - 1;
    return indexGrid.map((value) => {
      const idx = Number(value);
      if (!Number.isFinite(idx) || idx < 0) return idx;
      if (idx >= LEGACY_FINE220_SHIFT_START) {
        return Math.min(maxIndex, idx + 1);
      }
      return idx;
    });
  },
  computeBackgroundIndexSet() {
    const set = Object.create(null);
    set["-1"] = true;

    if (!this.gridSize || !Array.isArray(this.gridIndexes) || !this.gridIndexes.length) {
      return set;
    }

    const counter = Object.create(null);
    const size = this.gridSize;
    const push = (idx) => {
      const key = String(idx);
      counter[key] = (counter[key] || 0) + 1;
    };

    for (let x = 0; x < size; x += 1) {
      push(this.gridIndexes[x]);
      push(this.gridIndexes[(size - 1) * size + x]);
    }
    for (let y = 1; y < size - 1; y += 1) {
      push(this.gridIndexes[y * size]);
      push(this.gridIndexes[y * size + (size - 1)]);
    }

    const entries = Object.keys(counter).map((key) => ({
      index: Number(key),
      count: counter[key]
    }));
    if (!entries.length) return set;

    entries.sort((a, b) => b.count - a.count);
    const nearWhiteEntries = entries.filter((item) => this.isNearWhiteByIndex(item.index));
    const hasNearWhite = nearWhiteEntries.length > 0;

    if (hasNearWhite) {
      nearWhiteEntries.sort((a, b) => b.count - a.count);
      const nearTopCount = nearWhiteEntries[0].count || 1;
      for (let i = 0; i < nearWhiteEntries.length; i += 1) {
        const item = nearWhiteEntries[i];
        if (item.count < Math.max(2, Math.floor(nearTopCount * 0.22))) continue;
        set[String(item.index)] = true;
      }
    }

    return set;
  },
  isBackgroundCell(index) {
    if (!Number.isFinite(index) || index < 0) return true;
    return Boolean(this.backgroundIndexSet && this.backgroundIndexSet[String(index)]);
  },
  computeContentBounds() {
    if (!this.gridSize || !this.gridIndexes.length) return null;
    let minCol = this.gridSize;
    let minRow = this.gridSize;
    let maxCol = -1;
    let maxRow = -1;

    for (let row = 0; row < this.gridSize; row += 1) {
      for (let col = 0; col < this.gridSize; col += 1) {
        const index = row * this.gridSize + col;
        if (this.isBackgroundCell(this.gridIndexes[index])) continue;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }

    if (maxCol < minCol || maxRow < minRow) return null;
    return { minCol, minRow, maxCol, maxRow };
  },
  computePrimaryContentBounds() {
    if (!this.gridSize || !this.gridIndexes.length) return null;
    const size = this.gridSize;
    const total = size * size;
    const visited = new Uint8Array(total);
    let best = null;

    const queue = new Int32Array(total);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (let start = 0; start < total; start += 1) {
      if (visited[start]) continue;
      if (this.isBackgroundCell(this.gridIndexes[start])) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let count = 0;
      let minCol = size;
      let minRow = size;
      let maxCol = -1;
      let maxRow = -1;

      while (head < tail) {
        const current = queue[head++];
        const row = Math.floor(current / size);
        const col = current - row * size;
        count += 1;

        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;

        for (let i = 0; i < dirs.length; i += 1) {
          const nextCol = col + dirs[i][0];
          const nextRow = row + dirs[i][1];
          if (nextCol < 0 || nextRow < 0 || nextCol >= size || nextRow >= size) continue;
          const next = nextRow * size + nextCol;
          if (visited[next]) continue;
          if (this.isBackgroundCell(this.gridIndexes[next])) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }

      if (!best || count > best.count) {
        best = { count, minCol, minRow, maxCol, maxRow };
      }
    }

    if (!best) return this.computeContentBounds();
    if (best.count < 12) return this.computeContentBounds();
    return {
      minCol: best.minCol,
      minRow: best.minRow,
      maxCol: best.maxCol,
      maxRow: best.maxRow
    };
  },
  getAutoFitScale(bounds) {
    if (!this.gridSize) return 1;
    const safeBounds = bounds || this.getDisplayBounds();
    const widthCells = safeBounds ? (safeBounds.maxCol - safeBounds.minCol + 1) : this.gridSize;
    const heightCells = safeBounds ? (safeBounds.maxRow - safeBounds.minRow + 1) : this.gridSize;
    const safeWidthCells = Math.max(1, widthCells);
    const safeHeightCells = Math.max(1, heightCells);
    const targetWidth = Math.max(80, this.data.canvasWidth - 24);
    const targetHeight = Math.max(80, this.data.canvasHeight - 24);
    const baseCell = this.getBaseCell();
    const fitScaleX = targetWidth / (safeWidthCells * baseCell);
    const fitScaleY = targetHeight / (safeHeightCells * baseCell);
    const scale = Math.min(fitScaleX, fitScaleY);
    const { minScale, maxScale } = this.getScaleLimits();
    return clamp(scale, minScale, maxScale);
  },
  centerContent(scale = null) {
    const bounds = this.getDisplayBounds();
    const resolvedScale = Number.isFinite(scale) ? scale : this.getAutoFitScale(bounds);
    const { minScale, maxScale } = this.getScaleLimits();
    const safeScale = clamp(resolvedScale, minScale, maxScale);
    this.scale = safeScale;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateScaleText();
  },
  drawStageCheckerBackground(ctx, canvasWidth, canvasHeight) {
    const tile = Math.max(10, EDITOR_STAGE_CHECKER_TILE);
    ctx.setFillStyle(EDITOR_STAGE_CHECKER_LIGHT);
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.setFillStyle(EDITOR_STAGE_CHECKER_DARK);
    for (let y = 0; y < canvasHeight; y += tile) {
      const rowOffset = (Math.floor(y / tile) % 2) ? tile : 0;
      for (let x = rowOffset; x < canvasWidth; x += tile * 2) {
        ctx.fillRect(x, y, tile, tile);
      }
    }
  },
  drawBoardBorder(ctx, originX, originY, boardWidth, boardHeight) {
    if (boardWidth <= 1 || boardHeight <= 1) return;
    const left = originX + 0.5;
    const top = originY + 0.5;
    const right = originX + boardWidth - 0.5;
    const bottom = originY + boardHeight - 0.5;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, top);
    ctx.setLineWidth(1.2);
    ctx.setStrokeStyle("rgba(31, 36, 48, 0.38)");
    ctx.stroke();
  },
  redrawCanvas(lightMode = false) {
    if (!this.canvasReady) return;

    const {
      drawCell,
      originX,
      originY,
      boardWidth,
      boardHeight,
      bounds,
      canvasWidth,
      canvasHeight
    } = this.getBoardMetrics();
    const ctx = this.getEditorDrawContext();
    const isBeadMode = this.data.viewMode === "bead";
    const dragLikeMode = lightMode && (
      this.interactionMode === "move"
      || this.interactionMode === "pinch"
      || this.interactionMode === "scale"
    );
    const highlightIndex = this.data.beadHighlightIndex;

    this.drawStageCheckerBackground(ctx, canvasWidth, canvasHeight);

    if (this.data.hasEditableGrid && this.gridSize > 0 && this.gridIndexes.length) {
      const displayCols = bounds.cols;
      const displayRows = bounds.rows;
      const startCol = bounds.minCol;
      const startRow = bounds.minRow;
      let lastColor = "";
      for (let row = 0; row < displayRows; row += 1) {
        const rawRow = startRow + row;
        let segmentStart = 0;
        let segmentColor = this.cellColorByIndex(this.gridIndexes[rawRow * this.gridSize + startCol]);
        for (let col = 1; col <= displayCols; col += 1) {
          const reachedEnd = col === displayCols;
          const color = reachedEnd
            ? ""
            : this.cellColorByIndex(this.gridIndexes[rawRow * this.gridSize + startCol + col]);
          if (!reachedEnd && color === segmentColor) continue;
          if (segmentColor !== lastColor) {
            ctx.setFillStyle(segmentColor);
            lastColor = segmentColor;
          }
          ctx.fillRect(
            originX + segmentStart * drawCell,
            originY + row * drawCell,
            (col - segmentStart) * drawCell,
            drawCell
          );
          segmentStart = col;
          segmentColor = color;
        }
      }

      if (isBeadMode && Number.isFinite(highlightIndex) && highlightIndex >= 0) {
        ctx.setFillStyle("rgba(255,255,255,0.56)");
        for (let row = 0; row < displayRows; row += 1) {
          const rawRow = startRow + row;
          let segmentStart = -1;
          for (let col = 0; col <= displayCols; col += 1) {
            let shouldDim = false;
            if (col < displayCols) {
              const idx = this.gridIndexes[rawRow * this.gridSize + startCol + col];
              shouldDim = !this.isBackgroundCell(idx) && idx !== highlightIndex;
            }
            if (shouldDim && segmentStart < 0) segmentStart = col;
            if (!shouldDim && segmentStart >= 0) {
              ctx.fillRect(
                originX + segmentStart * drawCell,
                originY + row * drawCell,
                (col - segmentStart) * drawCell,
                drawCell
              );
              segmentStart = -1;
            }
          }
        }
      }

      this.drawBoardBorder(ctx, originX, originY, boardWidth, boardHeight);

      if (this.data.showGridLines && drawCell >= 4 && !dragLikeMode) {
        ctx.beginPath();
        for (let i = 0; i <= displayCols; i += 1) {
          if (i % 5 === 0) continue;
          const p = i * drawCell;
          ctx.moveTo(originX + p, originY);
          ctx.lineTo(originX + p, originY + boardHeight);
        }
        for (let i = 0; i <= displayRows; i += 1) {
          if (i % 5 === 0) continue;
          const p = i * drawCell;
          ctx.moveTo(originX, originY + p);
          ctx.lineTo(originX + boardWidth, originY + p);
        }
        ctx.setLineWidth(0.8);
        ctx.setStrokeStyle("rgba(31,36,48,0.18)");
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= displayCols; i += 5) {
          const p = i * drawCell;
          ctx.moveTo(originX + p, originY);
          ctx.lineTo(originX + p, originY + boardHeight);
        }
        for (let i = 0; i <= displayRows; i += 5) {
          const p = i * drawCell;
          ctx.moveTo(originX, originY + p);
          ctx.lineTo(originX + boardWidth, originY + p);
        }
        ctx.setLineWidth(1.2);
        ctx.setStrokeStyle("rgba(31,36,48,0.32)");
        ctx.stroke();
      }

      if (this.data.showLocatorLines && drawCell >= 4 && !dragLikeMode) {
        ctx.beginPath();
        for (let i = 0; i <= displayCols; i += 10) {
          const p = i * drawCell;
          ctx.moveTo(originX + p, originY);
          ctx.lineTo(originX + p, originY + boardHeight);
        }
        for (let i = 0; i <= displayRows; i += 10) {
          const p = i * drawCell;
          ctx.moveTo(originX, originY + p);
          ctx.lineTo(originX + boardWidth, originY + p);
        }
        ctx.setLineWidth(1.6);
        ctx.setStrokeStyle("rgba(255,59,92,0.34)");
        ctx.stroke();
      }

      const shouldDrawLabels = drawCell >= 8 && !dragLikeMode && (isBeadMode || this.data.showColorCodeInEdit);
      if (shouldDrawLabels) {
        const labels = Array.isArray(this.beadCellLabels) ? this.beadCellLabels : [];
        ctx.setTextAlign("center");
        ctx.setTextBaseline("middle");
        for (let row = 0; row < displayRows; row += 1) {
          const rawRow = startRow + row;
          for (let col = 0; col < displayCols; col += 1) {
            const rawCol = startCol + col;
            const index = rawRow * this.gridSize + rawCol;
            const colorIndex = this.gridIndexes[index];
            if (this.isBackgroundCell(colorIndex)) continue;
            const label = isBeadMode
              ? (labels[index] || this.getPaletteColor(colorIndex).code)
              : this.getPaletteColor(colorIndex).code;
            if (!label) continue;
            const length = String(label).length;
            const textSize = clamp(Math.floor(drawCell * (length >= 3 ? 0.34 : 0.44)), 8, 14);
            ctx.setFontSize(textSize);
            ctx.setFillStyle(this.getTextColorByIndex(colorIndex));
            ctx.fillText(
              String(label),
              originX + col * drawCell + drawCell / 2,
              originY + row * drawCell + drawCell / 2
            );
          }
        }
      }
    }

    ctx.draw();
  },
  toCanvasPoint(touch) {
    if (!touch || !this.canvasRect) return null;
    const p = getTouchXY(touch);
    return {
      x: (p.x - this.canvasRect.left) * this.canvasRatioX,
      y: (p.y - this.canvasRect.top) * this.canvasRatioY
    };
  },
  pointToCell(point) {
    if (!point || !this.data.hasEditableGrid || !this.gridSize) return null;
    const { drawCell, originX, originY, bounds } = this.getBoardMetrics();
    const x = (point.x - originX) / drawCell;
    const y = (point.y - originY) / drawCell;
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || row < 0 || col >= bounds.cols || row >= bounds.rows) return null;
    const rawCol = bounds.minCol + col;
    const rawRow = bounds.minRow + row;
    return {
      col: rawCol,
      row: rawRow,
      index: rawRow * this.gridSize + rawCol
    };
  },
  drawLiveChangedCells(changedCells) {
    if (!this.canvasReady || !Array.isArray(changedCells) || !changedCells.length || !this.gridSize) return;
    if (this.data.showColorCodeInEdit || this.data.viewMode === "bead") {
      this.requestRedraw(true);
      return;
    }
    if (changedCells.length > 220) {
      this.requestRedraw(true);
      return;
    }
    const { drawCell, originX, originY, bounds } = this.getBoardMetrics();
    if (drawCell < 2) return;

    const ctx = this.getEditorDrawContext();
    const lineMarks = Object.create(null);
    const markV = (xIndex, fromY, toY) => {
      lineMarks[`v:${xIndex}:${fromY}:${toY}`] = { t: "v", xIndex, fromY, toY };
    };
    const markH = (yIndex, fromX, toX) => {
      lineMarks[`h:${yIndex}:${fromX}:${toX}`] = { t: "h", yIndex, fromX, toX };
    };

    for (let i = 0; i < changedCells.length; i += 1) {
      const cell = changedCells[i];
      if (!cell) continue;
      const col = Number(cell.col);
      const row = Number(cell.row);
      if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
      if (col < 0 || row < 0 || col >= this.gridSize || row >= this.gridSize) continue;
      if (col < bounds.minCol || col > bounds.maxCol || row < bounds.minRow || row > bounds.maxRow) continue;
      const localCol = col - bounds.minCol;
      const localRow = row - bounds.minRow;

      const index = row * this.gridSize + col;
      const color = this.cellColorByIndex(this.gridIndexes[index]);
      const x = originX + localCol * drawCell;
      const y = originY + localRow * drawCell;
      ctx.setFillStyle(color);
      ctx.fillRect(x, y, drawCell, drawCell);

      markV(localCol, localRow, localRow + 1);
      markV(localCol + 1, localRow, localRow + 1);
      markH(localRow, localCol, localCol + 1);
      markH(localRow + 1, localCol, localCol + 1);
    }

    const lines = Object.keys(lineMarks).map((key) => lineMarks[key]);
    if (this.data.showGridLines) {
      let hasMinor = false;
      let hasMajor = false;
      ctx.beginPath();
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const major = line.t === "v"
          ? line.xIndex % 5 === 0
          : line.yIndex % 5 === 0;
        if (major) {
          hasMajor = true;
        } else {
          hasMinor = true;
        }
        if (major) continue;
        if (line.t === "v") {
          const x = originX + line.xIndex * drawCell;
          const y1 = originY + line.fromY * drawCell;
          const y2 = originY + line.toY * drawCell;
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
        } else {
          const y = originY + line.yIndex * drawCell;
          const x1 = originX + line.fromX * drawCell;
          const x2 = originX + line.toX * drawCell;
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
        }
      }
      if (hasMinor) {
        ctx.setLineWidth(0.8);
        ctx.setStrokeStyle("rgba(31,36,48,0.18)");
        ctx.stroke();
      }

      if (hasMajor) {
        ctx.beginPath();
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          const major = line.t === "v"
            ? line.xIndex % 5 === 0
            : line.yIndex % 5 === 0;
          if (!major) continue;
          if (line.t === "v") {
            const x = originX + line.xIndex * drawCell;
            const y1 = originY + line.fromY * drawCell;
            const y2 = originY + line.toY * drawCell;
            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
          } else {
            const y = originY + line.yIndex * drawCell;
            const x1 = originX + line.fromX * drawCell;
            const x2 = originX + line.toX * drawCell;
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
          }
        }
        ctx.setLineWidth(1.2);
        ctx.setStrokeStyle("rgba(31,36,48,0.32)");
        ctx.stroke();
      }
    }

    if (this.data.showLocatorLines) {
      let hasLocator = false;
      ctx.beginPath();
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const locator = line.t === "v"
          ? line.xIndex % 10 === 0
          : line.yIndex % 10 === 0;
        if (!locator) continue;
        hasLocator = true;
        if (line.t === "v") {
          const x = originX + line.xIndex * drawCell;
          const y1 = originY + line.fromY * drawCell;
          const y2 = originY + line.toY * drawCell;
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
        } else {
          const y = originY + line.yIndex * drawCell;
          const x1 = originX + line.fromX * drawCell;
          const x2 = originX + line.toX * drawCell;
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
        }
      }
      if (hasLocator) {
        ctx.setLineWidth(1.4);
        ctx.setStrokeStyle("rgba(255,59,92,0.34)");
        ctx.stroke();
      }
    }

    ctx.draw(true);
  },
  applyScaleWithAnchor(nextScale, anchorCanvasPoint, anchorBoardX, anchorBoardY, updateOptions = {}) {
    const { minScale, maxScale } = this.getScaleLimits();
    const safeScale = clamp(nextScale, minScale, maxScale);
    const bounds = this.getDisplayBounds();
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(1, baseCell * safeScale);
    const boardWidth = drawCell * bounds.cols;
    const boardHeight = drawCell * bounds.rows;
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const centerOriginX = (canvasWidth - boardWidth) / 2;
    const centerOriginY = (canvasHeight - boardHeight) / 2;
    const originX = anchorCanvasPoint.x - anchorBoardX * drawCell;
    const originY = anchorCanvasPoint.y - anchorBoardY * drawCell;

    this.scale = safeScale;
    this.offsetX = originX - centerOriginX;
    this.offsetY = originY - centerOriginY;
    this.clampOffset();
    this.updateScaleText(updateOptions);
  },
  applyColorToCell(col, row, colorIndex, changesMap = null, changedCells = null) {
    if (!this.gridSize) return false;
    if (col < 0 || row < 0 || col >= this.gridSize || row >= this.gridSize) return false;
    const index = row * this.gridSize + col;
    const safeColor = colorIndex === -1 ? -1 : clamp(Math.floor(colorIndex), 0, this.palette.length - 1);
    const previous = this.gridIndexes[index];
    if (previous === safeColor) return false;
    if (changesMap && !Object.prototype.hasOwnProperty.call(changesMap, index)) {
      changesMap[index] = previous;
    }
    this.gridIndexes[index] = safeColor;
    if (Array.isArray(changedCells)) {
      changedCells.push({ col, row });
    }
    return true;
  },
  applyLineColor(fromCol, fromRow, toCol, toRow, colorIndex, changesMap = null, changedCells = null) {
    let changed = false;
    let x0 = fromCol;
    let y0 = fromRow;
    const x1 = toCol;
    const y1 = toRow;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
      if (this.applyColorToCell(x0, y0, colorIndex, changesMap, changedCells)) changed = true;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }

    return changed;
  },
  commitStrokeChanges(changesMap) {
    if (!changesMap) return;
    const changedIndexes = Object.keys(changesMap);
    if (!changedIndexes.length) return;

    const patch = changedIndexes.map((key) => {
      const index = Number(key);
      return {
        index,
        from: changesMap[key],
        to: this.gridIndexes[index]
      };
    });

    this.undoStack.push(patch);
    this.hasManualEdits = true;
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.rebuildResizeMasterFromCurrent();
    this.syncHistoryState();
  },
  applyPatch(patch, direction) {
    if (!Array.isArray(patch) || !patch.length) return;
    const useTo = direction === "redo";
    for (let i = 0; i < patch.length; i += 1) {
      const step = patch[i];
      const index = Number(step && step.index);
      if (!Number.isFinite(index) || index < 0 || index >= this.gridIndexes.length) continue;
      this.gridIndexes[index] = useTo ? step.to : step.from;
    }
  },
  schedulePersist() {
    if (!this.data.autoSaveEnabled) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.flushPendingPersist();
    }, 260);
  },
  persistEditedWork(gridImagePath = "") {
    if (!this.data.hasEditableGrid || !this.data.workId || !this.gridSize || !this.gridIndexes.length) return;
    const workLibrary = this.readWorkLibrary();
    const targetIndex = workLibrary.findIndex((item) => item && item.id === this.data.workId);
    if (targetIndex === -1) return;

    const usedColorIndexes = this.computeUsedColorIndexes();
    const work = workLibrary[targetIndex] || {};
    const patternSizeText = this.getPatternSizeText().replace("×", "x");
    const visibleBounds = this.getSerializableVisibleBounds();
    const nextPreviewImages = {
      ...(work.previewImages || {})
    };
    if (gridImagePath) {
      nextPreviewImages.grid = gridImagePath;
    }

    const next = {
      ...work,
      updatedAt: Date.now(),
      previewUpdatedAt: gridImagePath
        ? Date.now()
        : Number(work.previewUpdatedAt) || 0,
      size: patternSizeText || `${this.gridSize}x${this.gridSize}`,
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize: this.gridSize,
        indexGridPacked: packIndexGrid(this.gridIndexes, this.palette.length - 1),
        usedColorIndexes,
        backgroundHex: "#FFFFFF",
        userEdited: Boolean((work.editorData && work.editorData.userEdited) || this.hasManualEdits),
        paletteVersion: EDITOR_PALETTE_VERSION,
        visibleBounds: visibleBounds || undefined
      },
      beadEstimate: {
        total: this.gridSize * this.gridSize,
        colorUsed: usedColorIndexes.length
      },
      previewImages: nextPreviewImages
    };

    workLibrary[targetIndex] = next;
    this.writeWorkLibrary(workLibrary);
  },
  handleSwitchTool(event) {
    const tool = event.currentTarget.dataset.tool;
    if (!tool) return;
    this.handleCloseColorPicker();
    if (tool === this.data.currentTool) {
      if (tool === "move" || tool === "moveShape") {
        this.setData({
          currentTool: "paint",
          currentToolLabel: this.getToolLabel("paint"),
          showEraserMenu: false,
          showMoveShapeOverlay: false
        });
        wx.showToast({
          title: "已返回画笔模式",
          icon: "none",
          duration: 1200
        });
        return;
      }
      if (this.data.showEraserMenu) {
        this.setData({ showEraserMenu: false });
      }
      return;
    }
    this.setData({
      currentTool: tool,
      currentToolLabel: this.getToolLabel(tool),
      showEraserMenu: false,
      showMoveShapeOverlay: false
    });
    if (tool === "move" && !this.moveTipShown) {
      this.moveTipShown = true;
      wx.showToast({
        title: "已进入拖拽，再点一次返回画笔",
        icon: "none",
        duration: 1800
      });
    }
    if (tool === "moveShape" && !this.moveShapeTipShown) {
      this.moveShapeTipShown = true;
      wx.showToast({
        title: "点击已填色格子后拖动，可整体移动图案",
        icon: "none",
        duration: 2200
      });
    }
  },
  handleToggleEraserMenu() {
    this.handleCloseColorPicker();
    wx.showActionSheet({
      itemList: ["普通橡皮", "大橡皮（连续同色）"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.applyEraserMode("normal");
          return;
        }
        if (res.tapIndex === 1) {
          this.applyEraserMode("flood");
        }
      }
    });
  },
  applyEraserMode(mode) {
    const safeMode = mode === "flood" ? "flood" : "normal";
    const label = this.getToolLabel("erase", safeMode);
    this.setData({
      currentTool: "erase",
      eraserMode: safeMode,
      currentToolLabel: label,
      showEraserMenu: false
    });
    if (safeMode === "flood") {
      wx.showToast({
        title: "已切换大橡皮，点击可连续擦除相连同色区域",
        icon: "none",
        duration: 2000
      });
      return;
    }
    wx.showToast({
      title: "已切换普通橡皮",
      icon: "none",
      duration: 1400
    });
  },
  handleSelectEraserMode(event) {
    const mode = event.currentTarget.dataset.mode === "flood" ? "flood" : "normal";
    this.applyEraserMode(mode);
  },
  getShiftedShapeGrid(sourceGrid, deltaCol, deltaRow) {
    if (!Array.isArray(sourceGrid) || !this.gridSize) return null;
    const size = this.gridSize;
    const total = size * size;
    if (sourceGrid.length < total) return null;
    const fillIndex = this.getBackgroundFillIndex();
    const output = new Array(total).fill(fillIndex);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const index = row * size + col;
        const colorIndex = sourceGrid[index];
        if (this.isBackgroundCell(colorIndex)) continue;
        const nextCol = col + deltaCol;
        const nextRow = row + deltaRow;
        if (nextCol < 0 || nextRow < 0 || nextCol >= size || nextRow >= size) continue;
        output[nextRow * size + nextCol] = colorIndex;
      }
    }
    return output;
  },
  computeContentBoundsFromGrid(indexGrid) {
    if (!Array.isArray(indexGrid) || !this.gridSize) return null;
    const size = this.gridSize;
    let minCol = size;
    let minRow = size;
    let maxCol = -1;
    let maxRow = -1;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const index = row * size + col;
        if (this.isBackgroundCell(indexGrid[index])) continue;
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
      }
    }
    if (maxCol < minCol || maxRow < minRow) return null;
    return { minCol, minRow, maxCol, maxRow };
  },
  quantizeMoveShapeDelta(rawDelta, currentDelta) {
    const gate = 0.56;
    if (!Number.isFinite(rawDelta)) return currentDelta;
    let next = currentDelta;
    if (rawDelta > currentDelta + gate) {
      const step = Math.floor(rawDelta - currentDelta - gate) + 1;
      next = currentDelta + Math.max(1, step);
    } else if (rawDelta < currentDelta - gate) {
      const step = Math.floor(currentDelta - rawDelta - gate) + 1;
      next = currentDelta - Math.max(1, step);
    }
    return next;
  },
  applyMoveShapeResult(sourceGrid) {
    if (!Array.isArray(sourceGrid) || !sourceGrid.length || !this.gridIndexes.length) {
      this.requestRedraw(false);
      return;
    }
    const total = this.gridSize * this.gridSize;
    const changes = Object.create(null);
    for (let i = 0; i < total; i += 1) {
      if (sourceGrid[i] === this.gridIndexes[i]) continue;
      changes[i] = sourceGrid[i];
    }
    this.applyOperationPatch(changes, null, "已移动图案");
  },
  handleQuickAction(event) {
    const action = event.currentTarget.dataset.action;
    if (!action) return;
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    if (!this.data.hasEditableGrid) {
      wx.showToast({ title: "暂无可编辑图纸", icon: "none" });
      return;
    }

    if (action === "toggleGrid") {
      const next = !this.data.showGridLines;
      this.setData({ showGridLines: next }, () => this.requestRedraw(false));
      return;
    }
    if (action === "toggleColorCode") {
      const next = !this.data.showColorCodeInEdit;
      this.setData({ showColorCodeInEdit: next }, () => {
        this.requestRedraw(false);
        if (this.data.showExportPanel) this.refreshExportPreview();
      });
      return;
    }
    if (action === "toggleLocator") {
      const next = !this.data.showLocatorLines;
      this.setData({ showLocatorLines: next }, () => this.requestRedraw(false));
      return;
    }
    if (action === "mirror") {
      wx.showActionSheet({
        itemList: ["水平镜像", "垂直镜像"],
        success: (res) => {
          if (res.tapIndex === 0) this.applyMirror("horizontal");
          if (res.tapIndex === 1) this.applyMirror("vertical");
        }
      });
      return;
    }
    if (action === "center") {
      this.handleResetView();
      return;
    }
    if (action === "denoise") {
      this.applyDenoise();
      return;
    }
    if (action === "replaceColor") {
      this.handleReplaceSelectedColor();
      return;
    }
    if (action === "clearCanvas") {
      wx.showModal({
        title: "清空画布",
        content: "将清除当前图纸全部已绘制内容，是否继续？",
        confirmColor: "#ff3b5c",
        success: (res) => {
          if (!res.confirm) return;
          const fillIndex = this.getBackgroundFillIndex();
          const changes = Object.create(null);
          const changedCells = [];
          for (let row = 0; row < this.gridSize; row += 1) {
            for (let col = 0; col < this.gridSize; col += 1) {
              this.applyColorToCell(col, row, fillIndex, changes, changedCells);
            }
          }
          const changed = this.applyOperationPatch(changes, changedCells, "画布已清空");
          if (!changed) {
            wx.showToast({ title: "画布已是空白", icon: "none" });
          }
        }
      });
    }
  },
  eraseConnectedArea(cell, changesMap, changedCells) {
    if (!cell || !Number.isFinite(cell.index) || !this.gridSize || !this.gridIndexes.length) return false;
    const targetIndex = this.gridIndexes[cell.index];
    if (!Number.isFinite(targetIndex) || targetIndex < 0 || this.isBackgroundCell(targetIndex)) {
      return false;
    }

    const size = this.gridSize;
    const total = size * size;
    const queue = new Int32Array(total);
    const visited = new Uint8Array(total);
    let head = 0;
    let tail = 0;
    queue[tail++] = cell.index;
    visited[cell.index] = 1;
    let changed = false;

    while (head < tail) {
      const current = queue[head++];
      if (this.gridIndexes[current] !== targetIndex) continue;
      const row = Math.floor(current / size);
      const col = current - row * size;

      if (this.applyColorToCell(col, row, -1, changesMap, changedCells)) {
        changed = true;
      }

      if (col > 0) {
        const next = current - 1;
        if (!visited[next] && this.gridIndexes[next] === targetIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (col < size - 1) {
        const next = current + 1;
        if (!visited[next] && this.gridIndexes[next] === targetIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (row > 0) {
        const next = current - size;
        if (!visited[next] && this.gridIndexes[next] === targetIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (row < size - 1) {
        const next = current + size;
        if (!visited[next] && this.gridIndexes[next] === targetIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    return changed;
  },
  fillConnectedArea(cell, targetColorIndex, changesMap, changedCells) {
    if (!cell || !Number.isFinite(cell.index) || !this.gridSize || !this.gridIndexes.length) return false;
    const sourceIndex = this.gridIndexes[cell.index];
    const fillIndex = clamp(Math.floor(targetColorIndex), 0, this.palette.length - 1);
    if (!Number.isFinite(sourceIndex) || sourceIndex === fillIndex) return false;

    const size = this.gridSize;
    const total = size * size;
    const queue = new Int32Array(total);
    const visited = new Uint8Array(total);
    let head = 0;
    let tail = 0;
    queue[tail++] = cell.index;
    visited[cell.index] = 1;
    let changed = false;

    while (head < tail) {
      const current = queue[head++];
      if (this.gridIndexes[current] !== sourceIndex) continue;
      const row = Math.floor(current / size);
      const col = current - row * size;
      if (this.applyColorToCell(col, row, fillIndex, changesMap, changedCells)) {
        changed = true;
      }

      if (col > 0) {
        const next = current - 1;
        if (!visited[next] && this.gridIndexes[next] === sourceIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (col < size - 1) {
        const next = current + 1;
        if (!visited[next] && this.gridIndexes[next] === sourceIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (row > 0) {
        const next = current - size;
        if (!visited[next] && this.gridIndexes[next] === sourceIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (row < size - 1) {
        const next = current + size;
        if (!visited[next] && this.gridIndexes[next] === sourceIndex) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    return changed;
  },
  applyOperationPatch(changesMap, changedCells, toastTitle = "") {
    const keys = Object.keys(changesMap || {});
    if (!keys.length) return false;
    this.commitStrokeChanges(changesMap);
    this.refreshUsedPalette();
    this.refreshBeadMetrics();
    this.schedulePersist();
    if (Array.isArray(changedCells) && changedCells.length && changedCells.length <= 240) {
      this.drawLiveChangedCells(changedCells);
      this.requestRedraw(false);
    } else {
      this.requestRedraw(false);
    }
    if (toastTitle) {
      wx.showToast({ title: toastTitle, icon: "none", duration: 1400 });
    }
    return true;
  },
  getBackgroundFillIndex() {
    const keys = Object.keys(this.backgroundIndexSet || {});
    for (let i = 0; i < keys.length; i += 1) {
      const index = Number(keys[i]);
      if (!Number.isFinite(index) || index < 0) continue;
      if (this.isNearWhiteByIndex(index)) return index;
    }
    for (let i = 0; i < keys.length; i += 1) {
      const index = Number(keys[i]);
      if (Number.isFinite(index) && index >= 0) return index;
    }
    if (this.gridSize && Array.isArray(this.gridIndexes) && this.gridIndexes.length >= this.gridSize * this.gridSize) {
      return this.getDominantBorderIndex(this.gridIndexes, this.gridSize);
    }
    return 0;
  },
  applyMirror(direction) {
    if (!this.gridSize || !this.gridIndexes.length) return;
    const size = this.gridSize;
    const total = size * size;
    const nextGrid = new Array(total);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const srcIndex = row * size + col;
        const toCol = direction === "horizontal" ? (size - 1 - col) : col;
        const toRow = direction === "vertical" ? (size - 1 - row) : row;
        const targetIndex = toRow * size + toCol;
        nextGrid[targetIndex] = this.gridIndexes[srcIndex];
      }
    }
    const changes = Object.create(null);
    for (let i = 0; i < total; i += 1) {
      if (nextGrid[i] !== this.gridIndexes[i]) {
        changes[i] = this.gridIndexes[i];
        this.gridIndexes[i] = nextGrid[i];
      }
    }
    this.applyOperationPatch(changes, null, direction === "horizontal" ? "已水平镜像" : "已垂直镜像");
  },
  applyDenoise() {
    if (!this.gridSize || !this.gridIndexes.length) return;
    const size = this.gridSize;
    const total = size * size;
    const original = this.gridIndexes.slice(0, total);
    const changes = Object.create(null);
    const changedCells = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const index = row * size + col;
        const current = original[index];
        if (this.isBackgroundCell(current)) continue;

        const neighborCounter = Object.create(null);
        let sameCount = 0;
        let validNeighborCount = 0;
        for (let i = 0; i < dirs.length; i += 1) {
          const nc = col + dirs[i][0];
          const nr = row + dirs[i][1];
          if (nc < 0 || nr < 0 || nc >= size || nr >= size) continue;
          const nIndex = nr * size + nc;
          const nColor = original[nIndex];
          if (this.isBackgroundCell(nColor)) continue;
          validNeighborCount += 1;
          if (nColor === current) sameCount += 1;
          const key = String(nColor);
          neighborCounter[key] = (neighborCounter[key] || 0) + 1;
        }

        if (validNeighborCount < 3 || sameCount > 0) continue;
        let bestColor = current;
        let bestCount = 0;
        Object.keys(neighborCounter).forEach((key) => {
          const count = neighborCounter[key];
          if (count > bestCount) {
            bestCount = count;
            bestColor = Number(key);
          }
        });
        if (!Number.isFinite(bestColor) || bestColor === current || bestCount < 2) continue;
        this.applyColorToCell(col, row, bestColor, changes, changedCells);
      }
    }

    const changed = this.applyOperationPatch(changes, changedCells, "已去除杂色");
    if (!changed) {
      wx.showToast({ title: "未检测到可优化的杂色", icon: "none" });
    }
  },
  handleReplaceSelectedColor() {
    const fromIndex = this.data.selectedColorIndex;
    const candidates = this.computeUsedColorIndexes()
      .filter((index) => index !== fromIndex)
      .slice(0, 8)
      .map((index) => this.getPaletteColor(index));
    if (!candidates.length) {
      wx.showToast({ title: "暂无可替换目标色", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: candidates.map((item) => `${item.code} ${item.hex}`),
      success: (res) => {
        const chosen = candidates[res.tapIndex];
        if (!chosen) return;
        const changes = Object.create(null);
        const changedCells = [];
        for (let row = 0; row < this.gridSize; row += 1) {
          for (let col = 0; col < this.gridSize; col += 1) {
            const index = row * this.gridSize + col;
            if (this.gridIndexes[index] !== fromIndex) continue;
            this.applyColorToCell(col, row, chosen.index, changes, changedCells);
          }
        }
        const changed = this.applyOperationPatch(changes, changedCells, "已完成批量换色");
        if (!changed) {
          wx.showToast({ title: "当前色没有可替换像素", icon: "none" });
        }
      }
    });
  },
  handlePickColor(event) {
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    const raw = event.currentTarget.dataset.index;
    const index = toNumber(raw, 0);
    if (index < 0 || index >= this.palette.length) return;
    const color = this.getPaletteColor(index);
    const shouldSwitchToPaint = this.data.currentTool === "erase";
    this.setData({
      selectedColorIndex: index,
      selectedColorCode: color.code,
      selectedColorHex: color.hex,
      currentTool: shouldSwitchToPaint ? "paint" : this.data.currentTool,
      currentToolLabel: shouldSwitchToPaint ? TOOL_LABELS.paint : this.data.currentToolLabel
    });
  },
  handleCanvasTouchStart(event) {
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    if (!this.data.hasEditableGrid) return;
    const touches = Array.isArray(event.touches) ? event.touches : [];
    if (!touches.length) return;

    if (touches.length >= 2) {
      const p1 = this.toCanvasPoint(touches[0]);
      const p2 = this.toCanvasPoint(touches[1]);
      if (!p1 || !p2) return;
      const mid = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      const { drawCell, originX, originY } = this.getBoardMetrics();
      this.touchState = {
        type: "pinch",
        startDistance: distance(p1, p2),
        startScale: this.scale,
        anchorBoardX: (mid.x - originX) / drawCell,
        anchorBoardY: (mid.y - originY) / drawCell
      };
      this.interactionMode = "pinch";
      return;
    }

    const point = this.toCanvasPoint(touches[0]);
    if (!point) return;

    if (this.data.viewMode === "bead") {
      this.touchState = {
        type: "bead",
        startPoint: point,
        lastPoint: point,
        startOffsetX: this.offsetX,
        startOffsetY: this.offsetY,
        moved: false
      };
      this.interactionMode = "move";
      return;
    }

    if (this.data.currentTool === "move") {
      this.touchState = {
        type: "move",
        startPoint: point,
        startOffsetX: this.offsetX,
        startOffsetY: this.offsetY
      };
      this.interactionMode = "move";
      return;
    }

    const cell = this.pointToCell(point);
    if (!cell) {
      this.touchState = null;
      return;
    }

    if (this.data.currentTool === "pick") {
      const pickedIndex = this.gridIndexes[cell.index];
      if (Number.isFinite(pickedIndex) && pickedIndex >= 0) {
        const color = this.getPaletteColor(pickedIndex);
        this.setData({
          selectedColorIndex: pickedIndex,
          selectedColorCode: color.code,
          selectedColorHex: color.hex
        });
      }
      return;
    }

    if (this.data.currentTool === "bucket") {
      const changes = Object.create(null);
      const changedCells = [];
      const changed = this.fillConnectedArea(cell, this.data.selectedColorIndex, changes, changedCells);
      if (!changed) {
        wx.showToast({ title: "当前区域颜色一致，无需填充", icon: "none" });
        return;
      }
      this.interactionMode = "paint";
      this.applyOperationPatch(changes, changedCells);
      return;
    }

    if (this.data.currentTool === "moveShape") {
      const sourceColor = this.gridIndexes[cell.index];
      if (this.isBackgroundCell(sourceColor)) {
        wx.showToast({
          title: "请先点击已填色格子，再拖动整体移动",
          icon: "none",
          duration: 1500
        });
        return;
      }
      this.touchState = {
        type: "moveShape",
        startPoint: point,
        deltaCol: 0,
        deltaRow: 0,
        sourceGrid: this.gridIndexes.slice(),
        minDeltaCol: 0,
        maxDeltaCol: 0,
        minDeltaRow: 0,
        maxDeltaRow: 0
      };
      const bounds = this.computeContentBoundsFromGrid(this.touchState.sourceGrid);
      if (!bounds) {
        this.touchState = null;
        this.interactionMode = "";
        wx.showToast({ title: "图案为空，无法移动", icon: "none" });
        return;
      }
      this.touchState.minDeltaCol = -bounds.minCol;
      this.touchState.maxDeltaCol = this.gridSize - 1 - bounds.maxCol;
      this.touchState.minDeltaRow = -bounds.minRow;
      this.touchState.maxDeltaRow = this.gridSize - 1 - bounds.maxRow;
      this.interactionMode = "moveShape";
      this.setData({
        showMoveShapeOverlay: true,
        moveShapeDeltaText: "Δx 0 · Δy 0"
      });
      return;
    }

    if (this.data.currentTool === "erase" && this.data.eraserMode === "flood") {
      const changes = Object.create(null);
      const changedCells = [];
      const changed = this.eraseConnectedArea(cell, changes, changedCells);
      if (!changed) return;
      this.interactionMode = "paint";
      this.drawLiveChangedCells(changedCells);
      this.commitStrokeChanges(changes);
      this.refreshUsedPalette();
      this.refreshBeadMetrics();
      this.schedulePersist();
      return;
    }

    const paintIndex = this.data.currentTool === "erase" ? -1 : this.data.selectedColorIndex;
    const changes = Object.create(null);
    const changedCells = [];
    const changed = this.applyColorToCell(cell.col, cell.row, paintIndex, changes, changedCells);
    this.touchState = {
      type: "paint",
      paintIndex,
      lastCol: cell.col,
      lastRow: cell.row,
      hasChanged: changed,
      changes
    };
    this.interactionMode = "paint";

    if (changed) {
      this.drawLiveChangedCells(changedCells);
    }
  },
  handleCanvasTouchMove(event) {
    if (!this.data.hasEditableGrid || !this.touchState) return;
    const touches = Array.isArray(event.touches) ? event.touches : [];

    if (touches.length >= 2 && this.touchState.type === "pinch") {
      const p1 = this.toCanvasPoint(touches[0]);
      const p2 = this.toCanvasPoint(touches[1]);
      if (!p1 || !p2) return;
      const nextDistance = distance(p1, p2);
      if (!nextDistance || !this.touchState.startDistance) return;
      const ratio = nextDistance / this.touchState.startDistance;
      const nextScale = this.touchState.startScale * ratio;
      if (Math.abs(nextScale - this.scale) < 0.01) return;
      const mid = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      this.applyScaleWithAnchor(
        nextScale,
        mid,
        this.touchState.anchorBoardX,
        this.touchState.anchorBoardY
      );
      this.requestRedraw(true);
      return;
    }

    if (!touches.length) return;
    const point = this.toCanvasPoint(touches[0]);
    if (!point) return;

    if (this.touchState.type === "bead") {
      const dx = point.x - this.touchState.startPoint.x;
      const dy = point.y - this.touchState.startPoint.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.touchState.moved = true;
      }
      const nextOffsetX = this.touchState.startOffsetX + dx;
      const nextOffsetY = this.touchState.startOffsetY + dy;
      if (Math.abs(nextOffsetX - this.offsetX) < 0.8 && Math.abs(nextOffsetY - this.offsetY) < 0.8) {
        this.touchState.lastPoint = point;
        return;
      }
      this.offsetX = nextOffsetX;
      this.offsetY = nextOffsetY;
      this.clampOffset();
      this.touchState.lastPoint = point;
      this.requestRedraw(true);
      return;
    }

    if (this.touchState.type === "move") {
      const dx = point.x - this.touchState.startPoint.x;
      const dy = point.y - this.touchState.startPoint.y;
      const nextOffsetX = this.touchState.startOffsetX + dx;
      const nextOffsetY = this.touchState.startOffsetY + dy;
      if (Math.abs(nextOffsetX - this.offsetX) < 0.8 && Math.abs(nextOffsetY - this.offsetY) < 0.8) return;
      this.offsetX = nextOffsetX;
      this.offsetY = nextOffsetY;
      this.clampOffset();
      this.requestRedraw(true);
      return;
    }

    if (this.touchState.type === "moveShape") {
      const { drawCell } = this.getBoardMetrics();
      const rawDeltaCol = (point.x - this.touchState.startPoint.x) / drawCell;
      const rawDeltaRow = (point.y - this.touchState.startPoint.y) / drawCell;
      let deltaCol = this.quantizeMoveShapeDelta(rawDeltaCol, this.touchState.deltaCol);
      let deltaRow = this.quantizeMoveShapeDelta(rawDeltaRow, this.touchState.deltaRow);
      deltaCol = clamp(deltaCol, this.touchState.minDeltaCol, this.touchState.maxDeltaCol);
      deltaRow = clamp(deltaRow, this.touchState.minDeltaRow, this.touchState.maxDeltaRow);
      if (deltaCol === this.touchState.deltaCol && deltaRow === this.touchState.deltaRow) return;
      const shifted = this.getShiftedShapeGrid(this.touchState.sourceGrid, deltaCol, deltaRow);
      if (!shifted) return;
      this.touchState.deltaCol = deltaCol;
      this.touchState.deltaRow = deltaRow;
      this.gridIndexes = shifted;
      this.setData({
        moveShapeDeltaText: `Δx ${deltaCol} · Δy ${deltaRow}`
      });
      this.requestRedraw(true);
      return;
    }

    if (this.touchState.type === "paint") {
      const changedCells = [];
      const cell = this.pointToCell(point);
      if (!cell) return;
      if (cell.col === this.touchState.lastCol && cell.row === this.touchState.lastRow) return;
      const changed = this.applyLineColor(
        this.touchState.lastCol,
        this.touchState.lastRow,
        cell.col,
        cell.row,
        this.touchState.paintIndex,
        this.touchState.changes,
        changedCells
      );
      this.touchState.lastCol = cell.col;
      this.touchState.lastRow = cell.row;
      this.touchState.hasChanged = this.touchState.hasChanged || changed;
      if (changed) {
        this.drawLiveChangedCells(changedCells);
      }
    }
  },
  handleCanvasTouchEnd() {
    if (this.touchState && this.touchState.type === "moveShape") {
      const sourceGrid = this.touchState.sourceGrid;
      this.touchState = null;
      this.interactionMode = "";
      this.setData({ showMoveShapeOverlay: false });
      this.applyMoveShapeResult(sourceGrid);
      return;
    }

    if (this.touchState && this.touchState.type === "bead") {
      if (!this.touchState.moved) {
        const cell = this.pointToCell(this.touchState.lastPoint || this.touchState.startPoint);
        if (cell) {
          const index = this.gridIndexes[cell.index];
          if (!this.isBackgroundCell(index)) {
            this.toggleBeadHighlight(index);
          }
        }
      }
      this.touchState = null;
      this.interactionMode = "";
      this.requestRedraw(false);
      return;
    }

    if (this.touchState && this.touchState.type === "paint" && this.touchState.hasChanged) {
      this.commitStrokeChanges(this.touchState.changes);
      this.refreshUsedPalette();
      this.refreshBeadMetrics();
      this.schedulePersist();
    }
    this.touchState = null;
    this.interactionMode = "";
    this.requestRedraw(false);
  },
  applyScaleByPercent(percent, lightRedraw = true, updateOptions = {}) {
    const { minScale, maxScale } = this.getScaleLimits();
    const safePercent = clamp(Math.round(toNumber(percent, 100) || 100), Math.round(minScale * 100), Math.round(maxScale * 100));
    const nextScale = safePercent / 100;
    const center = {
      x: this.data.canvasWidth / 2,
      y: this.data.canvasHeight / 2
    };
    const { drawCell, originX, originY } = this.getBoardMetrics();
    const anchorBoardX = (center.x - originX) / drawCell;
    const anchorBoardY = (center.y - originY) / drawCell;
    const syncSlider = updateOptions.syncSlider !== false;
    const syncInput = updateOptions.syncInput !== false;
    const throttleMs = toNumber(updateOptions.throttleMs, 0);
    this.applyScaleWithAnchor(nextScale, center, anchorBoardX, anchorBoardY, {
      syncSlider,
      syncInput,
      throttleMs
    });
    this.showScaleOverlayHint({ hold: Boolean(updateOptions.holdOverlay) });
    this.requestRedraw(lightRedraw);
  },
  handleScaleSliderChanging(event) {
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    if (!this.data.hasEditableGrid) return;
    const percent = toNumber(event && event.detail && event.detail.value, this.data.scalePercent || 100);
    this.interactionMode = "scale";
    this.applyScaleByPercent(percent, true, {
      syncSlider: false,
      syncInput: false,
      throttleMs: 45,
      holdOverlay: true
    });
  },
  handleScaleSliderChange(event) {
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    if (!this.data.hasEditableGrid) return;
    const percent = toNumber(event && event.detail && event.detail.value, this.data.scalePercent || 100);
    this.interactionMode = "";
    this.applyScaleByPercent(percent, false, {
      syncSlider: true,
      syncInput: true,
      holdOverlay: false
    });
  },
  handleScaleInput(event) {
    const raw = String((event && event.detail && event.detail.value) || "");
    const sanitized = raw.replace(/[^\d]/g, "").slice(0, 3);
    this.setData({ scaleInputValue: sanitized });
  },
  commitScaleInput(rawValue) {
    if (!this.data.hasEditableGrid) return;
    const numeric = toNumber(String(rawValue || "").replace(/[^\d]/g, ""), this.data.scalePercent || 100);
    const { minScale, maxScale } = this.getScaleLimits();
    const safePercent = clamp(Math.round(numeric), Math.round(minScale * 100), Math.round(maxScale * 100));
    this.setData({
      scaleInputValue: String(safePercent),
      scalePercent: safePercent,
      scaleText: `${safePercent}%`
    });
    this.interactionMode = "";
    this.applyScaleByPercent(safePercent, false, {
      syncSlider: true,
      syncInput: true,
      holdOverlay: false
    });
  },
  handleScaleInputConfirm(event) {
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    this.commitScaleInput(event && event.detail && event.detail.value);
  },
  handleScaleInputBlur(event) {
    this.commitScaleInput(event && event.detail && event.detail.value);
  },
  handleResetView() {
    this.closeEraserMenu();
    this.centerContent();
    this.requestRedraw(false);
  },
  handleUndo() {
    this.closeEraserMenu();
    if (!this.undoStack.length) return;
    const patch = this.undoStack.pop();
    this.applyPatch(patch, "undo");
    this.hasManualEdits = true;
    this.redoStack.push(patch);
    this.rebuildResizeMasterFromCurrent();
    this.refreshUsedPalette();
    this.refreshBeadMetrics();
    this.requestRedraw(false);
    this.schedulePersist();
    this.syncHistoryState();
  },
  handleRedo() {
    this.closeEraserMenu();
    if (!this.redoStack.length) return;
    const patch = this.redoStack.pop();
    this.applyPatch(patch, "redo");
    this.hasManualEdits = true;
    this.undoStack.push(patch);
    this.rebuildResizeMasterFromCurrent();
    this.refreshUsedPalette();
    this.refreshBeadMetrics();
    this.requestRedraw(false);
    this.schedulePersist();
    this.syncHistoryState();
  },
  drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
  },
  getExportLegend() {
    const stats = Array.isArray(this.data.beadStats) ? this.data.beadStats : [];
    const totalCount = stats.reduce((sum, item) => sum + (Number(item && item.count) || 0), 0) || 1;
    return stats.map((item) => ({
      index: item.index,
      code: item.code,
      hex: item.hex,
      count: Number(item.count) || 0,
      percent: Math.max(0, Math.round(((Number(item.count) || 0) / totalCount) * 100))
    }));
  },
  getCellExportLabel(index) {
    if (!Number.isFinite(index) || index < 0) return "";
    if (Array.isArray(this.beadCellLabels) && this.beadCellLabels[index]) {
      return this.beadCellLabels[index];
    }
    return this.getPaletteColor(this.gridIndexes[index]).code;
  },
  estimateCanvasTextWidth(text, fontSize = 16) {
    const raw = String(text || "");
    const size = Math.max(10, Number(fontSize) || 10);
    let width = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      const code = raw.charCodeAt(i);
      const isCjk = (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
      if (isCjk) {
        width += size;
        continue;
      }
      if (code <= 0x7f) {
        const isWideAscii = /[A-Z0-9]/.test(ch);
        width += size * (isWideAscii ? 0.62 : 0.54);
        continue;
      }
      width += size * 0.78;
    }
    return Math.ceil(width);
  },
  computeLegendChipLayout(legend, maxWidth, options = {}) {
    const list = Array.isArray(legend) ? legend : [];
    const usableWidth = Math.max(120, Math.floor(maxWidth));
    const swatchSize = Math.max(12, Math.floor(toNumber(options.swatchSize, 18)));
    const chipHeight = Math.max(34, Math.floor(toNumber(options.chipHeight, 48)));
    const chipPadX = Math.max(8, Math.floor(toNumber(options.chipPadX, 10)));
    const textGap = Math.max(8, Math.floor(toNumber(options.textGap, 10)));
    const codeSize = Math.max(12, Math.floor(toNumber(options.codeSize, 16)));
    const metaSize = Math.max(10, Math.floor(toNumber(options.metaSize, 13)));
    const colGap = Math.max(6, Math.floor(toNumber(options.colGap, 10)));
    const rowGap = Math.max(6, Math.floor(toNumber(options.rowGap, 10)));
    const minChipWidth = Math.max(60, Math.floor(toNumber(options.minChipWidth, 88)));
    const maxChipWidth = Math.max(minChipWidth, Math.floor(toNumber(options.maxChipWidth, 116)));
    const preferredColumns = Math.max(1, Math.floor(toNumber(options.preferredColumns, 8)));

    const maxColumnsByWidth = Math.max(1, Math.floor((usableWidth + colGap) / (minChipWidth + colGap)));
    const minColumnsByMaxWidth = Math.max(1, Math.ceil((usableWidth + colGap) / (maxChipWidth + colGap)));
    const targetColumns = Math.max(minColumnsByMaxWidth, preferredColumns);
    const columns = Math.min(
      Math.max(1, list.length || 1),
      Math.max(1, Math.min(maxColumnsByWidth, targetColumns))
    );
    const chipWidth = Math.max(
      minChipWidth,
      Math.floor((usableWidth - colGap * (columns - 1)) / columns)
    );

    const chips = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] || {};
      const codeText = String(item.code || "");
      const metaText = `${Number(item.count) || 0}颗`;
      const chipHex = item.hex || "#000000";
      const col = i % columns;
      const row = Math.floor(i / columns);

      chips.push({
        x: col * (chipWidth + colGap),
        y: row * (chipHeight + rowGap),
        width: chipWidth,
        height: chipHeight,
        swatchSize,
        chipPadX,
        textGap,
        codeSize,
        metaSize,
        codeText,
        metaText,
        hex: chipHex,
        textColor: this.getTextColorByHex(chipHex)
      });
    }

    const rows = chips.length ? Math.ceil(chips.length / columns) : 0;
    const contentHeight = rows ? (rows * chipHeight + (rows - 1) * rowGap) : 0;
    return { chips, contentHeight };
  },
  computePosterLayout(baseWidth, legendCount) {
    const width = Math.max(1400, Math.floor(baseWidth));
    const padding = Math.floor(width * 0.035);
    const gap = Math.floor(width * 0.024);
    const legendWidth = Math.max(360, Math.floor(width * 0.28));
    const gridSize = width - padding * 2 - legendWidth - gap;
    const columns = legendCount >= 10 ? 2 : 1;
    const cardGap = Math.max(14, Math.floor(width * 0.01));
    const cardWidth = Math.floor((legendWidth - cardGap * (columns - 1)) / columns);
    const cardHeight = Math.max(104, Math.floor(width * 0.08));
    return {
      width,
      height: padding * 2 + gridSize,
      background: "#F6EEDF",
      grid: {
        x: padding,
        y: padding,
        size: gridSize
      },
      legend: {
        x: padding + gridSize + gap,
        y: padding,
        width: legendWidth,
        height: gridSize,
        columns,
        cardGap,
        cardWidth,
        cardHeight
      }
    };
  },
  computePngPosterLayout(baseWidth, legend, mode = "ultra") {
    const width = Math.max(960, Math.floor(baseWidth));
    const pagePadding = Math.max(22, Math.floor(width * 0.032));
    const contentWidth = Math.max(320, width - pagePadding * 2);
    const gridGap = Math.max(18, Math.floor(width * 0.016));
    const list = Array.isArray(legend) ? legend : [];
    const legendCount = list.length;
    const panelPaddingX = Math.max(16, Math.floor(width * 0.011));
    const panelPaddingY = Math.max(14, Math.floor(width * 0.010));
    const titleSize = clamp(Math.floor(width * 0.020), 22, 52);
    const summarySize = clamp(Math.floor(width * 0.0125), 13, 28);
    const titleGap = Math.max(10, Math.floor(width * 0.007));
    const chipsTopGap = Math.max(16, Math.floor(width * 0.011));
    const gridSize = Math.max(320, Math.floor(contentWidth));
    const preferredLegendColumns = legendCount >= 54
      ? 14
      : legendCount >= 36
        ? 12
        : legendCount >= 18
          ? 10
          : 8;
    const chipConfig = {
      swatchSize: clamp(Math.floor(width * 0.014), 22, 36),
      chipHeight: clamp(Math.floor(width * (mode === "standard" ? 0.027 : 0.025)), 58, 80),
      chipPadX: clamp(Math.floor(width * 0.0045), 8, 14),
      textGap: clamp(Math.floor(width * 0.004), 8, 14),
      codeSize: clamp(Math.floor(width * 0.0105), 15, 24),
      metaSize: clamp(Math.floor(width * 0.009), 13, 20),
      colGap: clamp(Math.floor(width * 0.005), 10, 16),
      rowGap: clamp(Math.floor(width * 0.0055), 10, 18),
      minChipWidth: clamp(Math.floor(width * 0.055), 120, 160),
      maxChipWidth: clamp(Math.floor(width * 0.075), 180, 220),
      preferredColumns: mode === "standard" ? Math.min(preferredLegendColumns, 12) : preferredLegendColumns
    };
    const chipLayout = this.computeLegendChipLayout(
      list,
      Math.max(120, gridSize - panelPaddingX * 2),
      chipConfig
    );
    const legendPanelHeight = panelPaddingY
      + titleSize
      + titleGap
      + summarySize
      + chipsTopGap
      + chipLayout.contentHeight
      + panelPaddingY;

    const targetHeight43 = Math.floor(width * 0.75);
    const requiredHeight = pagePadding * 2 + gridSize + gridGap + legendPanelHeight;
    const height = Math.max(targetHeight43, requiredHeight);
    const gridX = pagePadding;
    const gridY = pagePadding;
    const legendY = gridY + gridSize + gridGap;

    return {
      width,
      height,
      background: "#F6EEDF",
      grid: {
        x: gridX,
        y: gridY,
        size: gridSize
      },
      legend: {
        x: gridX,
        y: legendY,
        width: gridSize,
        height: legendPanelHeight,
        panelPaddingX,
        panelPaddingY,
        titleSize,
        summarySize,
        titleGap,
        chipsTopGap,
        chips: chipLayout.chips
      }
    };
  },
  drawExportGrid(ctx, options) {
    const {
      x,
      y,
      size,
      showCodes,
      showCodeOutline = true,
      showAxisLabels,
      axisStep = 1,
      withGrid = true,
      showPageSplit = false,
      splitPlan = null
    } = options;

    const axisBand = showAxisLabels ? Math.max(30, Math.floor(size * 0.045)) : 0;
    const drawSize = size - axisBand * 2;
    const cellSize = Math.max(1, Math.floor(drawSize / this.gridSize));
    const boardSize = cellSize * this.gridSize;
    const startX = x + Math.floor((size - boardSize) / 2);
    const startY = y + Math.floor((size - boardSize) / 2);

    ctx.setFillStyle("#FFFFFF");
    ctx.fillRect(startX, startY, boardSize, boardSize);

    let lastColor = "";
    for (let row = 0; row < this.gridSize; row += 1) {
      let segmentStart = 0;
      let segmentColor = this.cellColorByIndex(this.gridIndexes[row * this.gridSize]);
      for (let col = 1; col <= this.gridSize; col += 1) {
        const reachedEnd = col === this.gridSize;
        const color = reachedEnd ? "" : this.cellColorByIndex(this.gridIndexes[row * this.gridSize + col]);
        if (!reachedEnd && color === segmentColor) continue;
        if (segmentColor !== lastColor) {
          ctx.setFillStyle(segmentColor);
          lastColor = segmentColor;
        }
        ctx.fillRect(
          startX + segmentStart * cellSize,
          startY + row * cellSize,
          (col - segmentStart) * cellSize,
          cellSize
        );
        segmentStart = col;
        segmentColor = color;
      }
    }

    const tintAlpha = showCodes ? 0.08 : 0.18;
    ctx.setFillStyle(`rgba(255,255,255,${tintAlpha})`);
    ctx.fillRect(startX, startY, boardSize, boardSize);

    if (showCodes) {
      const labelCache = Array.isArray(this.beadCellLabels) ? this.beadCellLabels : null;
      const textColorCache = Object.create(null);
      ctx.setTextAlign("center");
      ctx.setTextBaseline("middle");
      for (let row = 0; row < this.gridSize; row += 1) {
        for (let col = 0; col < this.gridSize; col += 1) {
          const index = row * this.gridSize + col;
          const colorIndex = this.gridIndexes[index];
          if (this.isBackgroundCell(colorIndex)) continue;
          const label = labelCache && labelCache[index]
            ? labelCache[index]
            : this.getPaletteColor(colorIndex).code;
          if (!label) continue;
          const textSize = clamp(Math.floor(cellSize * (String(label).length >= 3 ? 0.5 : 0.62)), 10, 34);
          const centerX = Math.round(startX + col * cellSize + cellSize / 2);
          const centerY = Math.round(startY + row * cellSize + cellSize / 2);
          let mainColor = textColorCache[colorIndex];
          if (!mainColor) {
            mainColor = this.getTextColorByIndex(colorIndex);
            textColorCache[colorIndex] = mainColor;
          }
          const outlineColor = mainColor === "#FFFFFF" ? "rgba(0,0,0,0.46)" : "rgba(255,255,255,0.55)";
          const offset = 1;
          const shouldDrawOutline = Boolean(showCodeOutline && cellSize <= 15);

          ctx.setFontSize(textSize);
          if (shouldDrawOutline) {
            ctx.setFillStyle(outlineColor);
            ctx.fillText(String(label), centerX - offset, centerY);
            ctx.fillText(String(label), centerX + offset, centerY);
            ctx.fillText(String(label), centerX, centerY - offset);
            ctx.fillText(String(label), centerX, centerY + offset);
          }
          ctx.setFillStyle(mainColor);
          ctx.fillText(
            String(label),
            centerX,
            centerY
          );
        }
      }
    }

    if (withGrid) {
      for (let i = 0; i <= this.gridSize; i += 1) {
        const pos = i * cellSize;
        const major = i % 5 === 0;
        ctx.beginPath();
        ctx.setLineWidth(major ? 1.8 : 0.9);
        ctx.setStrokeStyle(major ? "rgba(15,23,42,0.52)" : "rgba(15,23,42,0.2)");
        ctx.moveTo(startX + pos, startY);
        ctx.lineTo(startX + pos, startY + boardSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.setLineWidth(major ? 1.8 : 0.9);
        ctx.setStrokeStyle(major ? "rgba(15,23,42,0.52)" : "rgba(15,23,42,0.2)");
        ctx.moveTo(startX, startY + pos);
        ctx.lineTo(startX + boardSize, startY + pos);
        ctx.stroke();
      }
    }

    if (showPageSplit && splitPlan && splitPlan.cellsPerPage > 0) {
      ctx.setStrokeStyle("rgba(255,59,92,0.75)");
      ctx.setLineWidth(Math.max(2, cellSize * 0.14));
      for (let i = splitPlan.cellsPerPage; i < this.gridSize; i += splitPlan.cellsPerPage) {
        const pos = i * cellSize;
        ctx.beginPath();
        ctx.moveTo(startX + pos, startY);
        ctx.lineTo(startX + pos, startY + boardSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startX, startY + pos);
        ctx.lineTo(startX + boardSize, startY + pos);
        ctx.stroke();
      }
    }

    if (showAxisLabels) {
      const safeStep = Math.max(1, axisStep);
      const fontSize = Math.max(16, Math.floor(cellSize * 0.4));
      ctx.setFontSize(fontSize);
      ctx.setFillStyle("#4A3A26");
      ctx.setTextBaseline("middle");
      for (let i = 1; i <= this.gridSize; i += safeStep) {
        const centerX = startX + (i - 0.5) * cellSize;
        const centerY = startY + (i - 0.5) * cellSize;
        const label = String(i);
        ctx.setTextAlign("center");
        ctx.fillText(label, centerX, startY - Math.max(12, axisBand * 0.42));
        ctx.fillText(label, centerX, startY + boardSize + Math.max(12, axisBand * 0.42));
        ctx.setTextAlign("right");
        ctx.fillText(label, startX - Math.max(8, axisBand * 0.22), centerY);
        ctx.setTextAlign("left");
        ctx.fillText(label, startX + boardSize + Math.max(8, axisBand * 0.22), centerY);
      }
      if ((this.gridSize - 1) % safeStep !== 0) {
        const centerX = startX + (this.gridSize - 0.5) * cellSize;
        const centerY = startY + (this.gridSize - 0.5) * cellSize;
        const label = String(this.gridSize);
        ctx.setTextAlign("center");
        ctx.fillText(label, centerX, startY - Math.max(12, axisBand * 0.42));
        ctx.fillText(label, centerX, startY + boardSize + Math.max(12, axisBand * 0.42));
        ctx.setTextAlign("right");
        ctx.fillText(label, startX - Math.max(8, axisBand * 0.22), centerY);
        ctx.setTextAlign("left");
        ctx.fillText(label, startX + boardSize + Math.max(8, axisBand * 0.22), centerY);
      }
    }
  },
  drawExportLegend(ctx, layout, legend) {
    ctx.setFillStyle("#FFF8ED");
    this.drawRoundedRectPath(ctx, layout.x, layout.y, layout.width, layout.height, 28);
    ctx.fill();

    const totalCount = legend.reduce((sum, item) => sum + (Number(item && item.count) || 0), 0);
    const summaryText = `共 ${legend.length} 种颜色 · 总计 ${totalCount}`;

    ctx.setTextAlign("left");
    ctx.setTextBaseline("top");
    ctx.setFontSize(layout.titleSize || 34);
    ctx.setFillStyle("#2A1D12");
    ctx.fillText(
      "颜色图例 / 颗粒统计",
      layout.x + (layout.panelPaddingX || 26),
      layout.y + (layout.panelPaddingY || 20)
    );

    ctx.setFillStyle("#67584A");
    ctx.setFontSize(layout.summarySize || 20);
    ctx.fillText(
      summaryText,
      layout.x + (layout.panelPaddingX || 26),
      layout.y + (layout.panelPaddingY || 20) + (layout.titleSize || 34) + (layout.titleGap || 12)
    );

    const chipsTop = layout.y
      + (layout.panelPaddingY || 20)
      + (layout.titleSize || 34)
      + (layout.titleGap || 12)
      + (layout.summarySize || 20)
      + (layout.chipsTopGap || 18);
    const chips = Array.isArray(layout.chips) ? layout.chips : [];
    chips.forEach((chip) => {
      const itemX = layout.x + (layout.panelPaddingX || 0) + chip.x;
      const itemY = chipsTop + chip.y;
      const swatchSize = Math.max(
        24,
        Math.min(
          chip.swatchSize || 0,
          chip.height - 10,
          Math.floor(chip.width * 0.34)
        )
      );
      const swatchX = itemX + (chip.chipPadX || 0);
      const swatchY = itemY + Math.floor((chip.height - swatchSize) / 2);
      const textX = swatchX + swatchSize + (chip.textGap || 0);
      const codeY = itemY + Math.max(2, Math.floor(chip.height * 0.14));
      const metaY = itemY + Math.max(24, Math.floor(chip.height * 0.54));

      ctx.setFillStyle(chip.hex || "#000000");
      this.drawRoundedRectPath(
        ctx,
        swatchX,
        swatchY,
        swatchSize,
        swatchSize,
        Math.max(6, Math.floor(swatchSize * 0.16))
      );
      ctx.fill();
      ctx.setStrokeStyle("rgba(42,29,18,0.18)");
      ctx.setLineWidth(1.2);
      ctx.stroke();

      ctx.setTextAlign("left");
      ctx.setTextBaseline("top");
      ctx.setFillStyle("#2A1D12");
      ctx.setFontSize(Math.max(14, chip.codeSize));
      ctx.fillText(
        chip.codeText || "",
        textX,
        codeY
      );

      ctx.setFillStyle("#65594A");
      ctx.setFontSize(Math.max(12, chip.metaSize));
      ctx.fillText(
        chip.metaText || "",
        textX,
        metaY
      );
    });
  },
  async renderPosterExportImage(options = {}) {
    const forPreview = Boolean(options.forPreview);
    const forViewer = Boolean(options.forViewer);
    const showGrid = Object.prototype.hasOwnProperty.call(options, "showGrid")
      ? Boolean(options.showGrid)
      : this.data.exportShowGrid !== false;
    const showCodes = Object.prototype.hasOwnProperty.call(options, "showCodes")
      ? Boolean(options.showCodes)
      : this.data.exportShowCodes !== false;
    const defaultWidth = forPreview
      ? EXPORT_PREVIEW_WIDTH
      : (forViewer ? EXPORT_PREVIEW_HD_WIDTH : EXPORT_PNG_ULTRA_WIDTH);
    const totalCells = Math.max(0, this.gridSize * this.gridSize);
    let baseWidth = defaultWidth;
    if (!forPreview && !forViewer) {
      if (totalCells <= 26000) {
        baseWidth = Math.max(baseWidth, 3600);
      } else if (totalCells >= 42000) {
        baseWidth = Math.min(baseWidth, 3000);
      } else if (totalCells >= 30000) {
        baseWidth = Math.min(baseWidth, 3200);
      }
    }
    const legend = this.getExportLegend();
    const layout = this.computePngPosterLayout(baseWidth, legend, "ultra");
    const shouldUseCodeOutline = showCodes && (forPreview || forViewer || totalCells <= 18000);
    this.logLoadDiagnostics("export-render", {
      workId: this.data.workId,
      mode: forPreview ? "preview" : (forViewer ? "viewer" : "album"),
      showGrid,
      showCodes,
      totalCells,
      exportWidth: layout.width,
      exportHeight: layout.height,
      exportScale: Number(layout.grid && layout.grid.size) / Math.max(1, this.gridSize),
      exportBounds: this.getDisplayBounds(),
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY
    });
    await this.updateExportCanvasSizeAsync(layout.width, layout.height);

    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle(layout.background);
      ctx.fillRect(0, 0, layout.width, layout.height);
      this.drawExportGrid(ctx, {
        x: layout.grid.x,
        y: layout.grid.y,
        size: layout.grid.size,
        showCodes,
        showCodeOutline: shouldUseCodeOutline,
        showAxisLabels: true,
        axisStep: this.gridSize > 60 ? 5 : 1,
        withGrid: showGrid
      });
      this.drawExportLegend(ctx, layout.legend, legend);
    });

    return this.canvasToTempFileAsync("exportCanvas", layout.width, layout.height);
  },
  async refreshExportPreview() {
    if (!this.data.showExportPanel || !this.data.hasEditableGrid) return;
    const showGrid = this.data.exportShowGrid !== false;
    const showCodes = this.data.exportShowCodes !== false;
    const summary = this.buildExportSummary(showGrid, showCodes);
    const previewToken = Date.now();
    this.exportPreviewToken = previewToken;

    this.setData({
      exportPreviewBusy: true,
      exportPreviewTitle: summary.title,
      exportPreviewDesc: summary.desc,
      exportLargeHint: summary.largeHint,
      exportPanelHint: "将导出高清 PNG 图片，可按开关选择是否显示网格与色号。",
      exportPrimaryText: "导出高清图片到相册"
    });

    try {
      const previewPath = await this.renderPosterExportImage({
        forPreview: true,
        showGrid,
        showCodes
      });

      if (this.exportPreviewToken !== previewToken) return;
      this.exportPreviewPath = previewPath;
      this.setData({
        exportPreviewPath: previewPath,
        exportPreviewBusy: false
      });
    } catch (error) {
      if (this.exportPreviewToken !== previewToken) return;
      console.error("refresh export preview failed", error);
      this.setData({
        exportPreviewBusy: false
      });
    }
  },
  async openExportPanel() {
    await this.setDataAsync({
      showSaveMenu: false,
      showExportPanel: true,
      exportShowGrid: this.exportSettings ? this.exportSettings.showGrid !== false : true,
      exportShowCodes: this.exportSettings ? this.exportSettings.showCodes !== false : true,
      exportPreviewPath: "",
      exportProgressVisible: false,
      exportProgressPercent: 0,
      exportProgressText: "",
      showExportPreviewViewer: false,
      exportViewerPath: "",
      exportViewerBusy: false,
      exportViewerScale: 1,
      exportViewerScaleText: "100%",
      exportViewerBaseWidth: 0,
      exportViewerImageWidth: 0,
      exportViewerHint: ""
    });
    this.exportViewerCacheKey = "";
    this.exportViewerPath = "";
    this.refreshExportPreview();
  },
  closeExportPanel() {
    if (this.data.exportBusy) {
      wx.showToast({ title: "正在导出，请稍候", icon: "none" });
      return;
    }
    this.resetExportProgress();
    this.setData({
      showExportPanel: false,
      exportPreviewBusy: false,
      exportBusy: false,
      showExportPreviewViewer: false,
      exportViewerBusy: false
    }, () => this.requestRedraw(false));
  },
  handleExportOptionToggle(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.key
      : "";
    if (key !== "exportShowGrid" && key !== "exportShowCodes") return;
    const nextValue = !Boolean(this.data[key]);
    if (!this.exportSettings || typeof this.exportSettings !== "object") {
      this.exportSettings = getDefaultExportSettings();
    }
    if (key === "exportShowGrid") {
      this.exportSettings.showGrid = nextValue;
    } else {
      this.exportSettings.showCodes = nextValue;
    }
    this.persistExportSettings();
    const payload = {
      showExportPreviewViewer: false
    };
    payload[key] = nextValue;
    this.setData(payload, () => {
      this.exportViewerCacheKey = "";
      this.exportViewerPath = "";
      this.refreshExportPreview();
    });
  },
  computeViewerBaseWidth(imageWidth = 0) {
    const safeWindowWidth = Math.max(320, Number(this.windowWidth) || 375);
    const fallback = Math.round(safeWindowWidth * 1.4);
    const upperBound = Math.round(safeWindowWidth * 2.6);
    const safeImageWidth = Math.max(0, Math.floor(imageWidth));
    return Math.max(
      safeWindowWidth,
      Math.min(safeImageWidth || fallback, upperBound)
    );
  },
  updateExportViewerScale(scale) {
    const safeScale = clamp(Number(scale) || 1, 1, 4);
    const baseWidth = Math.max(this.windowWidth || 375, toNumber(this.data.exportViewerBaseWidth, 0));
    const imageWidth = Math.max(baseWidth, Math.round(baseWidth * safeScale));
    this.setData({
      exportViewerScale: safeScale,
      exportViewerScaleText: `${Math.round(safeScale * 100)}%`,
      exportViewerImageWidth: imageWidth
    });
  },
  async buildExportViewerPath() {
    return this.renderPosterExportImage({
      forViewer: true,
      showGrid: this.data.exportShowGrid !== false,
      showCodes: this.data.exportShowCodes !== false
    });
  },
  closeExportPreviewViewer() {
    this.setData({ showExportPreviewViewer: false }, () => this.requestRedraw(false));
  },
  async handleSaveWork() {
    if (!this.data.hasEditableGrid) {
      wx.showToast({ title: "暂无可保存的作品", icon: "none" });
      return;
    }
    this.flushPendingPersist();
    wx.showToast({ title: "作品已保存", icon: "success" });
  },
  async handlePublishWork() {
    if (!this.data.hasEditableGrid || !this.data.workId) {
      wx.showToast({ title: "暂无可发布的作品", icon: "none" });
      return;
    }
    const publishTitle = this.normalizePublishTitle(this.data.publishDraftTitle);
    if (!publishTitle || publishTitle.length < 2) {
      wx.showToast({ title: "请输入2-20字作品名称", icon: "none" });
      return;
    }
    this.flushPendingPersist();
    const currentWork = this.getCurrentWorkRecord();
    if (!currentWork) {
      wx.showToast({ title: "作品不存在，无法发布", icon: "none" });
      return;
    }

    const publishedList = this.readPublishedPaperLibrary();
    const existingRecord = publishedList.find((item) => item && item.sourceWorkId === this.data.workId);
    const loadingTitle = existingRecord ? "更新发布中" : "发布作品中";

    this.setData({ publishBusy: true });
    wx.showLoading({ title: loadingTitle, mask: true });
    try {
      let previewImage = "";
      try {
        previewImage = await this.buildPublishPreviewImage();
      } catch (previewError) {
        console.warn("build publish preview failed", previewError);
      }
      if (!previewImage) {
        previewImage = String(
          (currentWork.previewImages && (
            currentWork.previewImages.grid
            || currentWork.previewImages.ai
            || currentWork.previewImages.origin
          )) || ""
        );
      }

      const nextRecord = this.buildPublishedPaperRecord(currentWork, existingRecord, previewImage);
      const nextList = existingRecord
        ? publishedList.map((item) => (item && item.sourceWorkId === this.data.workId ? nextRecord : item))
        : [nextRecord, ...publishedList];
      this.writePublishedPaperLibrary(nextList);
      const currentLibrary = this.readWorkLibrary();
      const workIndex = currentLibrary.findIndex((item) => item && item.id === this.data.workId);
      if (workIndex >= 0) {
        currentLibrary[workIndex] = {
          ...currentLibrary[workIndex],
          title: nextRecord.title,
          previewUpdatedAt: previewImage ? Date.now() : Number(currentLibrary[workIndex].previewUpdatedAt) || 0,
          previewImages: {
            ...(currentLibrary[workIndex].previewImages || {}),
            grid: previewImage || (currentLibrary[workIndex].previewImages && currentLibrary[workIndex].previewImages.grid) || ""
          }
        };
        this.writeWorkLibrary(currentLibrary);
      }
      this.setData({
        workName: nextRecord.title,
        showPublishModal: false
      });
      wx.showToast({
        title: existingRecord ? "已更新广场作品" : "已发布到图纸广场",
        icon: "success"
      });
    } catch (error) {
      console.error("publish work failed", error);
      wx.showToast({ title: "发布失败，请重试", icon: "none" });
    } finally {
      this.setData({ publishBusy: false });
      wx.hideLoading();
    }
  },
  async handleSaveMenuAction(event) {
    const action = event && event.currentTarget && event.currentTarget.dataset
      ? String(event.currentTarget.dataset.action || "")
      : "";
    this.handleCloseSaveMenu();
    if (action === "save") {
      await this.handleSaveWork();
      return;
    }
    if (action === "export") {
      await this.openExportPanel();
      return;
    }
    if (action === "publish") {
      this.openPublishModal();
    }
  },
  handlePreviewZoomOut() {
    this.updateExportViewerScale(this.data.exportViewerScale - 0.25);
  },
  handlePreviewZoomIn() {
    this.updateExportViewerScale(this.data.exportViewerScale + 0.25);
  },
  handlePreviewZoomReset() {
    this.updateExportViewerScale(1);
  },
  async handlePreviewExportImage() {
    if (this.data.exportPreviewBusy) {
      wx.showToast({ title: "预览图生成中", icon: "none" });
      return;
    }
    const cacheKey = `${this.data.exportShowGrid ? 1 : 0}:${this.data.exportShowCodes ? 1 : 0}`;

    if (this.exportViewerCacheKey === cacheKey && this.data.exportViewerPath) {
      this.setData({ showExportPreviewViewer: true });
      return;
    }

    this.setData({
      showExportPreviewViewer: true,
      exportViewerBusy: true,
      exportViewerHint: "正在生成高清预览，请稍候..."
    });

    wx.showLoading({ title: "生成高清预览", mask: true });
    try {
      const previewPath = await this.buildExportViewerPath();
      const info = await this.getImageInfo(previewPath).catch(() => null);
      const baseWidth = this.computeViewerBaseWidth(info && info.width);

      this.exportViewerCacheKey = cacheKey;
      this.exportViewerPath = previewPath;
      this.setData({
        exportViewerPath: previewPath,
        exportViewerBusy: false,
        exportViewerBaseWidth: baseWidth,
        exportViewerHint: "这是导出图片的高清预览，可直接核对像素、色号和颗粒统计。"
      });
      this.updateExportViewerScale(1);
    } catch (error) {
      console.error("open export viewer failed", error);
      this.setData({
        exportViewerBusy: false,
        showExportPreviewViewer: false
      });
      wx.showToast({ title: "生成预览失败，请重试", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
  async renderExportPng() {
    if (!this.gridSize || !this.gridIndexes.length) {
      throw new Error("empty grid");
    }
    return this.renderPosterExportImage({
      showGrid: this.data.exportShowGrid !== false,
      showCodes: this.data.exportShowCodes !== false
    });
  },
  saveImageToAlbum(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject
      });
    });
  },
  setExportProgress(percent, text = "", options = {}) {
    const safePercent = clamp(Math.floor(toNumber(percent, 0)), 0, 100);
    const payload = {};
    if (this.data.exportProgressPercent !== safePercent) {
      payload.exportProgressPercent = safePercent;
    }
    if (typeof text === "string" && text.length && this.data.exportProgressText !== text) {
      payload.exportProgressText = text;
    }
    if (Object.prototype.hasOwnProperty.call(options, "visible")) {
      const visible = Boolean(options.visible);
      if (this.data.exportProgressVisible !== visible) {
        payload.exportProgressVisible = visible;
      }
    }
    if (Object.keys(payload).length) {
      this.setData(payload);
    }
  },
  startExportProgress(initialText = "正在准备导出...", options = {}) {
    if (this.exportProgressTimer) {
      clearInterval(this.exportProgressTimer);
      this.exportProgressTimer = null;
    }
    const startPercent = clamp(Math.floor(toNumber(options.startPercent, 2)), 0, 99);
    const capPercent = clamp(Math.floor(toNumber(options.capPercent, 24)), startPercent, 99);
    this.exportProgressSoftPercent = startPercent;
    this.exportProgressCapPercent = capPercent;
    this.setExportProgress(startPercent, initialText, { visible: true });
    this.exportProgressTimer = setInterval(() => {
      if (!this.data.exportBusy) return;
      if (this.exportProgressSoftPercent >= this.exportProgressCapPercent) return;
      const gap = this.exportProgressCapPercent - this.exportProgressSoftPercent;
      const step = gap > 18 ? 3 : (gap > 8 ? 2 : 1);
      this.exportProgressSoftPercent = Math.min(
        this.exportProgressCapPercent,
        this.exportProgressSoftPercent + step
      );
      this.setExportProgress(this.exportProgressSoftPercent);
    }, 280);
  },
  updateExportProgressStage(minPercent, capPercent, text = "") {
    const safeMin = clamp(Math.floor(toNumber(minPercent, 0)), 0, 99);
    const safeCap = clamp(Math.floor(toNumber(capPercent, safeMin)), safeMin, 99);
    this.exportProgressCapPercent = safeCap;
    if (this.exportProgressSoftPercent < safeMin) {
      this.exportProgressSoftPercent = safeMin;
    }
    this.setExportProgress(this.exportProgressSoftPercent, text, { visible: true });
  },
  resetExportProgress() {
    if (this.exportProgressTimer) {
      clearInterval(this.exportProgressTimer);
      this.exportProgressTimer = null;
    }
    this.exportProgressSoftPercent = 0;
    this.exportProgressCapPercent = 0;
    this.setData({
      exportProgressVisible: false,
      exportProgressPercent: 0,
      exportProgressText: ""
    });
  },
  finishExportProgress(doneText = "导出完成") {
    if (this.exportProgressTimer) {
      clearInterval(this.exportProgressTimer);
      this.exportProgressTimer = null;
    }
    this.exportProgressSoftPercent = 100;
    this.exportProgressCapPercent = 100;
    this.setExportProgress(100, doneText, { visible: true });
  },
  async handleExportConfirm() {
    if (this.data.exportBusy) return;
    this.setData({ exportBusy: true });
    this.startExportProgress(
      "正在准备高清图片导出...",
      { startPercent: 3, capPercent: 18 }
    );

    try {
      this.updateExportProgressStage(12, 72, "正在生成高清画布（大图可能需要更久）...");
      const pngPath = await this.renderExportPng();
      this.updateExportProgressStage(78, 88, "正在整理导出文件...");
      this.persistEditedWork(pngPath);
      this.updateExportProgressStage(90, 98, "正在保存到相册...");
      await this.saveImageToAlbum(pngPath);
      this.finishExportProgress("导出完成，已保存到相册");
      wx.showToast({ title: "导出图片已保存到相册", icon: "success" });
      this.setData({ exportBusy: false });
      this.closeExportPanel();
    } catch (error) {
      console.error("export confirm failed", error);
      this.resetExportProgress();
      wx.showToast({
        title: "导出失败，请重试",
        icon: "none"
      });
    } finally {
      if (this.data.exportBusy) {
        this.setData({ exportBusy: false });
      }
    }
  },
  async handleSaveExport() {
    if (!this.data.hasEditableGrid) {
      wx.showToast({ title: "暂无可导出的图纸", icon: "none" });
      return;
    }
    const nextVisible = !this.data.showSaveMenu;
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    this.handleCloseBeadStatsOverlay();
    this.setData({ showSaveMenu: nextVisible });
  },
  handleEnterBeadMode() {
    if (!this.data.hasEditableGrid || !this.data.workId) {
      wx.showToast({ title: "暂无可查看图纸", icon: "none" });
      return;
    }
    const name = encodeURIComponent(this.data.workName || "");
    wx.navigateTo({
      url: `/pages/bead/index?workId=${this.data.workId}&name=${name}`
    });
  }
});
