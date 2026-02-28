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
const REMIXICON_FONT_FAMILY = "remixicon";
const REMIXICON_FONT_URL = "https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.ttf";
const EXPORT_PNG_STANDARD_WIDTH = 2400;
const EXPORT_PNG_ULTRA_WIDTH = 3200;
const EXPORT_PREVIEW_WIDTH = 960;
const EXPORT_PREVIEW_HD_WIDTH = 1920;
const EDITOR_STAGE_BG = "#ECEFF3";
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
  if (!width || !height || width !== height) return 0;
  return width;
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
    format: "pdf",
    pdfMode: "a4",
    pngMode: "ultra",
    pdfPaperSize: "A4"
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
    currentTool: "paint",
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
    currentToolLabel: "画笔",
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
    usedPalette: [],
    fullPalette: [],
    showExportPanel: false,
    exportFormat: "pdf",
    exportMode: "a4",
    exportModeOptions: [],
    exportPdfPaperSize: "A4",
    exportPdfPaperOptions: [],
    exportPreviewPath: "",
    exportPreviewTitle: "导出预览",
    exportPreviewDesc: "",
    exportLargeHint: "",
    exportPrimaryText: "导出图册 PDF",
    exportPanelHint: "",
    exportPreviewBusy: false,
    exportBusy: false,
    pdfExportReady: false,
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
    this.exportPreviewDebounce = null;
    this.exportPreviewPath = "";
    this.exportViewerCacheKey = "";
    this.exportViewerPath = "";
    this.useCanvas2d = false;
    this.editorCanvasNode = null;
    this.editorCtx2d = null;
    this.lastLightRedrawAt = 0;
    this.edgePickerCloseLocked = false;
    this.edgePickerLockTimer = null;
    this.windowWidth = 375;
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
      currentToolLabel: TOOL_LABELS.paint,
      eraserMode: "normal",
      showEraserMenu: false,
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
      exportFormat: this.exportSettings.format,
      exportMode: this.exportSettings.format === "png" ? this.exportSettings.pngMode : this.exportSettings.pdfMode,
      exportModeOptions: this.buildExportModeOptions(this.exportSettings.format),
      exportPdfPaperSize: this.exportSettings.pdfPaperSize,
      exportPdfPaperOptions: this.buildPdfPaperOptions(),
      exportPreviewTitle: "导出预览",
      exportPreviewDesc: "",
      exportLargeHint: "",
      exportPrimaryText: this.exportSettings.format === "png" ? "导出图片到相册" : "导出图册 PDF",
      exportPanelHint: "",
      exportPreviewBusy: false,
      exportBusy: false,
      pdfExportReady: this.canUsePdfExport(),
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
  onPageScroll(event) {
    this.pageScrollTop = toNumber(event && event.scrollTop, this.pageScrollTop || 0);
  },
  onUnload() {
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
    this.pageScrollTop = 0;
    this.persistEditedWork();
  },
  setDataAsync(payload) {
    return new Promise((resolve) => {
      this.setData(payload, resolve);
    });
  },
  loadExportSettings() {
    try {
      const stored = wx.getStorageSync(EXPORT_SETTINGS_KEY);
      const defaults = getDefaultExportSettings();
      if (!stored || typeof stored !== "object") return defaults;
      return {
        format: stored.format === "png" ? "png" : "pdf",
        pdfMode: stored.pdfMode === "ultra" ? "ultra" : "a4",
        pngMode: stored.pngMode === "standard" ? "standard" : "ultra",
        pdfPaperSize: stored.pdfPaperSize === "A3" ? "A3" : "A4"
      };
    } catch (error) {
      return getDefaultExportSettings();
    }
  },
  persistExportSettings() {
    try {
      const payload = {
        format: this.exportSettings && this.exportSettings.format === "png" ? "png" : "pdf",
        pdfMode: this.exportSettings && this.exportSettings.pdfMode === "ultra" ? "ultra" : "a4",
        pngMode: this.exportSettings && this.exportSettings.pngMode === "standard" ? "standard" : "ultra",
        pdfPaperSize: this.exportSettings && this.exportSettings.pdfPaperSize === "A3" ? "A3" : "A4"
      };
      wx.setStorageSync(EXPORT_SETTINGS_KEY, payload);
    } catch (error) {
      // ignore storage errors
    }
  },
  buildPdfPaperOptions() {
    return [
      { value: "A4", label: "A4（推荐）" },
      { value: "A3", label: "A3（单页更大）" }
    ];
  },
  buildExportModeOptions(format) {
    if (format === "png") {
      return [
        { value: "standard", label: "标准高清图片" },
        { value: "ultra", label: "超清大图" }
      ];
    }
    return [
      { value: "a4", label: "A4 分页图册" },
      { value: "ultra", label: "超大单页图册" }
    ];
  },
  getActiveExportMode(format) {
    const safeFormat = format === "png" ? "png" : "pdf";
    if (safeFormat === "png") {
      return this.exportSettings && this.exportSettings.pngMode === "standard" ? "standard" : "ultra";
    }
    return this.exportSettings && this.exportSettings.pdfMode === "ultra" ? "ultra" : "a4";
  },
  getPdfExportBaseUrl() {
    const app = getApp && getApp();
    const raw = app && app.globalData ? app.globalData.pdfExportBaseUrl : "";
    if (!raw || typeof raw !== "string") return "";
    return raw.replace(/\/$/, "");
  },
  canUsePdfExport() {
    return Boolean(this.getPdfExportBaseUrl());
  },
  computeExportDetailPlan(paperSize = "A4") {
    const safePaper = paperSize === "A3" ? "A3" : "A4";
    const defaultCells = safePaper === "A3" ? 28 : 20;
    const cellsPerPage = Math.min(this.gridSize || 0, Math.max(12, defaultCells));
    return {
      cellsPerPage,
      pagesX: this.gridSize ? Math.ceil(this.gridSize / cellsPerPage) : 0,
      pagesY: this.gridSize ? Math.ceil(this.gridSize / cellsPerPage) : 0
    };
  },
  buildExportSummary(format, mode) {
    if (format === "png") {
      const title = mode === "standard" ? "导出图片预览（标准）" : "导出图片预览（超清）";
      const desc = mode === "standard"
        ? "适合快速保存到相册与分享。"
        : "适合放大查看细节，保留色号、图例和颗粒统计。";
      return {
        title,
        desc,
        largeHint: this.gridSize >= 104 && mode === "standard"
          ? "超大尺寸建议优先使用“超清大图”或“图册分页”，细节更清晰。"
          : ""
      };
    }

    const plan = this.computeExportDetailPlan(this.data.exportPdfPaperSize || "A4");
    const paperLabel = (this.data.exportPdfPaperSize || "A4").toUpperCase() === "A3" ? "A3" : "A4";
    if (mode === "ultra") {
      return {
        title: "导出图册预览（超大单页）",
        desc: "适合在平板或电脑中放大查看完整图纸。",
        largeHint: this.canUsePdfExport() ? "" : "当前小程序未配置 PDF 服务域名，先显示页面内预览。"
      };
    }
    return {
      title: `导出图册预览（${paperLabel} 分页）`,
      desc: `会生成 1 张总览 + ${Math.max(1, plan.pagesX * plan.pagesY)} 张分页详图，每页约 ${plan.cellsPerPage}x${plan.cellsPerPage} 格。`,
      largeHint: this.canUsePdfExport()
        ? ""
        : "当前小程序未配置 PDF 服务域名，先显示页面内预览。"
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
    const hex = String((color && color.hex) || "#FFFFFF").replace("#", "");
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
  async buildResizeSourceFromImage(imagePath, targetMaxEdge) {
    if (!imagePath) return null;
    const effectiveTarget = clamp(parseInt(targetMaxEdge, 10) || 0, MIN_PATTERN_EDGE, MAX_PATTERN_EDGE);
    if (!effectiveTarget) return null;
    const processingEdge = clamp(effectiveTarget * 2, effectiveTarget, 400);
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
    const processingEdge = clamp(nextGridSize * 2, nextGridSize, 400);
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
    const sourceGrid = quantized.hexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = this.paletteIndexByHex[key];
      return Number.isFinite(mapped) ? mapped : 0;
    });
    const bgIndex = this.getDominantBorderIndex(sourceGrid, processingEdge);
    const ratio = sourceWidth / Math.max(1, sourceHeight);
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

    // Do not auto-cut background: keep the whole source canvas and only resize.
    const rectScaled = this.resampleIndexGridSmart(
      sourceGrid,
      processingEdge,
      processingEdge,
      targetW,
      targetH,
      bgIndex
    );
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
        paletteVersion: EDITOR_PALETTE_VERSION
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
    if (runtime.length) return runtime;

    let cached = null;
    try {
      cached = wx.getStorageSync(STORAGE_KEY);
      if (!Array.isArray(cached) || !cached.length) {
        const backup = wx.getStorageSync(BACKUP_STORAGE_KEY);
        if (Array.isArray(backup) && backup.length) cached = backup;
      }
      if ((!Array.isArray(cached) || !cached.length) && LEGACY_STORAGE_KEY) {
        const legacy = wx.getStorageSync(LEGACY_STORAGE_KEY);
        if (Array.isArray(legacy) && legacy.length) cached = legacy;
      }
    } catch (error) {
      console.warn("read work library failed", error);
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
  async loadWork(workId) {
    if (!workId) {
      wx.showToast({ title: "作品不存在", icon: "none" });
      this.setData({ hasEditableGrid: false });
      return;
    }

    const workLibrary = this.readWorkLibrary();
    const work = workLibrary.find((item) => item && item.id === workId);
    if (!work) {
      wx.showToast({ title: "作品不存在", icon: "none" });
      this.setData({ hasEditableGrid: false });
      return;
    }
    this.resizeSourceImageCandidates = [
      work && work.previewImages && work.previewImages.origin,
      work && work.previewImages && work.previewImages.ai,
      work && work.previewImages && work.previewImages.grid
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
    const shouldLegacyRemap = hasValidGrid
      && hasPackedGrid
      && !paletteVersion
      && this.detectLegacyFine220Indexing(indexGridRaw, gridSize);
    if (shouldLegacyRemap) {
      indexGridRaw = this.remapLegacyFine220ToMard221(indexGridRaw.slice(0, total));
    }
    const detectedBroken = hasValidGrid ? this.looksShiftedToCorner(indexGridRaw, gridSize) : false;
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

    this.gridSize = gridSize;
    this.gridIndexes = this.recenterLegacyGrid(indexGridRaw.slice(0, total), gridSize);
    this.backgroundIndexSet = this.computeBackgroundIndexSet();
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
      usedPalette: this.buildPaletteByIndexes(usedStats.map((item) => item.index)),
      selectedColorIndex: initialColor,
      selectedColorCode: this.getPaletteColor(initialColor).code,
      selectedColorHex: this.getPaletteColor(initialColor).hex,
      patternMaxEdge: initialMaxEdge,
      selectedEditorMaxEdge: initialPreset,
      customEditorMaxEdge: initialPreset === "custom" ? initialEdgeText : "",
      maxEdgeError: ""
    });

    this.centerByGridCenter(1);

    if (this.canvasReady) {
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
            if (this.data.hasEditableGrid) this.centerByGridCenter(1);
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
        draw: () => {}
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
    const safeGrid = Math.max(1, Math.max(bounds.cols, bounds.rows));
    return Math.max(4, Math.floor((Math.min(canvasWidth, canvasHeight) - 24) / safeGrid));
  },
  getScaleLimits() {
    const baseCell = this.getBaseCell();
    const canvasEdge = Math.min(this.data.canvasWidth, this.data.canvasHeight);
    const maxScale = Math.max(1, canvasEdge / (baseCell * 3));
    return { minScale: 0.8, maxScale };
  },
  clampOffset() {
    const { canvasWidth, canvasHeight } = this.data;
    const bounds = this.getDisplayBounds();
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(2, baseCell * this.scale);
    const boardWidth = drawCell * bounds.cols;
    const boardHeight = drawCell * bounds.rows;
    const keepX = Math.min(boardWidth * 0.7, canvasWidth * 0.7);
    const keepY = Math.min(boardHeight * 0.7, canvasHeight * 0.7);
    const maxOX = (canvasWidth + boardWidth) / 2 - keepX;
    const maxOY = (canvasHeight + boardHeight) / 2 - keepY;
    this.offsetX = clamp(this.offsetX, -maxOX, maxOX);
    this.offsetY = clamp(this.offsetY, -maxOY, maxOY);
  },
  getDisplayBounds() {
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
    const drawCell = Math.max(2, baseCell * scale);
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
    return `${size}×${size}`;
  },
  openCustomEdgeInputModal() {
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
    this.openCustomEdgeInputModal();
  },
  handleSelectEditorMaxEdge(event) {
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
    this.setData({ customEditorMaxEdge: event.detail.value || "", maxEdgeError: "" });
  },
  handleApplyCustomMaxEdge() {
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
        for (let i = 0; i < candidates.length; i += 1) {
          const idx = candidates[i];
          if (idx === bgIndex) continue;
          const color = this.getPaletteColor(idx);
          const rgb = color && color.rgb ? color.rgb : parseHexRgb(color && color.hex);
          const dist = distanceSqRgb(targetRgb, rgb);
          const support = colorWeights[String(idx)] || 0;
          const centerBonus = idx === centerIndex ? 0.16 : 0;
          const score = dist - support * 2200 - centerBonus * 1800;
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
    const region = this.computePrimaryContentRegion(indexGrid, size, isResizeBackground);
    const bounds = region && region.bounds
      ? region.bounds
      : this.computeGridContentBoundsWithChecker(indexGrid, size, isResizeBackground);
    if (!bounds) return null;

    const width = bounds.maxCol - bounds.minCol + 1;
    const height = bounds.maxRow - bounds.minRow + 1;
    const bgIndex = this.getBackgroundFillIndex();
    const rectGrid = new Array(width * height).fill(bgIndex);
    const regionMask = region && region.mask ? region.mask : null;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const srcIndex = (bounds.minRow + row) * size + (bounds.minCol + col);
        const color = indexGrid[srcIndex];
        if (regionMask && !regionMask[srcIndex]) continue;
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
    const safeBounds = bounds || this.computePrimaryContentBounds() || this.computeContentBounds();
    const widthCells = safeBounds ? (safeBounds.maxCol - safeBounds.minCol + 1) : this.gridSize;
    const heightCells = safeBounds ? (safeBounds.maxRow - safeBounds.minRow + 1) : this.gridSize;
    const contentCells = Math.max(widthCells, heightCells, 1);

    const stageEdge = Math.min(this.data.canvasWidth, this.data.canvasHeight);
    const targetEdge = Math.max(220, stageEdge - 72);
    const baseCell = this.getBaseCell();
    const scale = targetEdge / (contentCells * baseCell);
    const { minScale, maxScale } = this.getScaleLimits();
    return clamp(scale, minScale, maxScale);
  },
  centerContent(scale = null) {
    const bounds = this.computePrimaryContentBounds() || this.computeContentBounds();
    const resolvedScale = Number.isFinite(scale) ? scale : this.getAutoFitScale(bounds);
    const { minScale, maxScale } = this.getScaleLimits();
    const safeScale = clamp(resolvedScale, minScale, maxScale);
    const drawCell = Math.max(2, this.getBaseCell() * safeScale);
    const contentCenterCol = bounds ? (bounds.minCol + bounds.maxCol + 1) / 2 : this.gridSize / 2;
    const contentCenterRow = bounds ? (bounds.minRow + bounds.maxRow + 1) / 2 : this.gridSize / 2;
    const boardCenter = this.gridSize / 2;

    this.scale = safeScale;
    this.offsetX = (boardCenter - contentCenterCol) * drawCell;
    this.offsetY = (boardCenter - contentCenterRow) * drawCell;
    this.updateScaleText();
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

    ctx.setFillStyle(EDITOR_STAGE_BG);
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

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
    const drawCell = Math.max(2, baseCell * safeScale);
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
      this.persistEditedWork();
      this.persistTimer = null;
    }, 260);
  },
  persistEditedWork(gridImagePath = "") {
    if (!this.data.hasEditableGrid || !this.data.workId || !this.gridSize || !this.gridIndexes.length) return;
    const workLibrary = this.readWorkLibrary();
    const targetIndex = workLibrary.findIndex((item) => item && item.id === this.data.workId);
    if (targetIndex === -1) return;

    const usedColorIndexes = this.computeUsedColorIndexes();
    const work = workLibrary[targetIndex] || {};
    const nextPreviewImages = {
      ...(work.previewImages || {})
    };
    if (gridImagePath) {
      nextPreviewImages.grid = gridImagePath;
    }

    const next = {
      ...work,
      size: `${this.gridSize}x${this.gridSize}`,
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize: this.gridSize,
        indexGridPacked: packIndexGrid(this.gridIndexes, this.palette.length - 1),
        usedColorIndexes,
        backgroundHex: "#FFFFFF",
        userEdited: Boolean((work.editorData && work.editorData.userEdited) || this.hasManualEdits),
        paletteVersion: EDITOR_PALETTE_VERSION
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
    this.centerByGridCenter(1);
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
  drawExportGrid(ctx, options) {
    const {
      x,
      y,
      size,
      showCodes,
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

    ctx.setFillStyle("rgba(255,255,255,0.18)");
    ctx.fillRect(startX, startY, boardSize, boardSize);

    if (showCodes) {
      ctx.setTextAlign("center");
      ctx.setTextBaseline("middle");
      for (let row = 0; row < this.gridSize; row += 1) {
        for (let col = 0; col < this.gridSize; col += 1) {
          const index = row * this.gridSize + col;
          const colorIndex = this.gridIndexes[index];
          if (this.isBackgroundCell(colorIndex)) continue;
          const label = this.getCellExportLabel(index);
          if (!label) continue;
          const textSize = clamp(Math.floor(cellSize * (String(label).length >= 3 ? 0.34 : 0.44)), 8, 26);
          ctx.setFontSize(textSize);
          ctx.setFillStyle(this.getTextColorByIndex(colorIndex));
          ctx.fillText(
            String(label),
            startX + col * cellSize + cellSize / 2,
            startY + row * cellSize + cellSize / 2
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

    ctx.setFontSize(34);
    ctx.setFillStyle("#2A1D12");
    ctx.fillText("颜色图例 / 颗粒统计", layout.x + 26, layout.y + 48);

    const cardTop = layout.y + 82;
    const swatchSize = Math.max(22, Math.floor(layout.cardWidth * 0.16));
    legend.forEach((item, index) => {
      const col = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      const cardX = layout.x + col * (layout.cardWidth + layout.cardGap);
      const cardY = cardTop + row * (layout.cardHeight + layout.cardGap);
      if (cardY + layout.cardHeight > layout.y + layout.height - 10) return;

      ctx.setFillStyle("#FFFFFF");
      this.drawRoundedRectPath(ctx, cardX, cardY, layout.cardWidth, layout.cardHeight, 20);
      ctx.fill();
      ctx.setStrokeStyle("#E4D6BE");
      ctx.setLineWidth(2);
      ctx.stroke();

      ctx.setFillStyle(item.hex || "#000000");
      ctx.fillRect(cardX + 18, cardY + 20, swatchSize, swatchSize);
      ctx.setStrokeStyle("rgba(15,23,42,0.08)");
      ctx.setLineWidth(1);
      ctx.strokeRect(cardX + 18, cardY + 20, swatchSize, swatchSize);

      ctx.setFillStyle("#2D241B");
      ctx.setFontSize(Math.max(22, Math.floor(layout.cardWidth * 0.13)));
      ctx.fillText(item.code || "", cardX + 18 + swatchSize + 16, cardY + 33);
      ctx.setFillStyle("#65594A");
      ctx.setFontSize(Math.max(18, Math.floor(layout.cardWidth * 0.1)));
      ctx.fillText(`${item.count} 颗`, cardX + 18 + swatchSize + 16, cardY + 64);
      ctx.fillText(`${item.percent}%`, cardX + 18 + swatchSize + 16, cardY + 88);
    });
  },
  async renderPosterExportImage(mode = "ultra", forPreview = false) {
    const baseWidth = forPreview
      ? EXPORT_PREVIEW_WIDTH
      : (mode === "standard" ? EXPORT_PNG_STANDARD_WIDTH : EXPORT_PNG_ULTRA_WIDTH);
    const legend = this.getExportLegend();
    const layout = this.computePosterLayout(baseWidth, legend.length);
    await this.updateExportCanvasSizeAsync(layout.width, layout.height);

    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle(layout.background);
      ctx.fillRect(0, 0, layout.width, layout.height);
      this.drawExportGrid(ctx, {
        x: layout.grid.x,
        y: layout.grid.y,
        size: layout.grid.size,
        showCodes: this.data.showColorCodeInEdit,
        showAxisLabels: true,
        axisStep: 1,
        withGrid: true
      });
      this.drawExportLegend(ctx, layout.legend, legend);
    });

    return this.canvasToTempFileAsync("exportCanvas", layout.width, layout.height);
  },
  async renderPdfPreviewImage(mode = "a4", previewWidth = EXPORT_PREVIEW_WIDTH, paperSize = "A4") {
    const safePaper = paperSize === "A3" ? "A3" : "A4";
    const width = Math.max(720, Math.floor(previewWidth));
    const height = mode === "a4"
      ? Math.max(960, Math.floor(width * 1.33))
      : Math.max(840, Math.floor(width * 1.02));
    const splitPlan = this.computeExportDetailPlan(safePaper);
    await this.updateExportCanvasSizeAsync(width, height);

    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#F4ECDD");
      ctx.fillRect(0, 0, width, height);

      if (mode === "ultra") {
        const legend = this.getExportLegend();
        const layout = this.computePosterLayout(width, legend.length);
        ctx.setFillStyle("#FFFFFF");
        this.drawRoundedRectPath(ctx, 40, 40, width - 80, height - 80, 26);
        ctx.fill();
        this.drawExportGrid(ctx, {
          x: layout.grid.x * 0.62,
          y: 78,
          size: width - 160,
          showCodes: false,
          showAxisLabels: true,
          axisStep: this.gridSize > 60 ? 5 : 1,
          withGrid: true
        });
        ctx.setFontSize(28);
        ctx.setFillStyle("#4A3A26");
        ctx.fillText("超大单页图册预览", 76, height - 88);
        return;
      }

      const paperX = 66;
      const paperY = 40;
      const paperW = width - 132;
      const paperH = height - 80;
      ctx.setFillStyle("#FFFFFF");
      this.drawRoundedRectPath(ctx, paperX, paperY, paperW, paperH, 24);
      ctx.fill();

      this.drawExportGrid(ctx, {
        x: paperX + 44,
        y: paperY + 44,
        size: paperW - 88,
        showCodes: false,
        showAxisLabels: true,
        axisStep: this.gridSize > 60 ? 5 : 1,
        withGrid: true,
        showPageSplit: true,
        splitPlan
      });

      ctx.setFontSize(26);
      ctx.setFillStyle("#4A3A26");
      ctx.fillText(
        `${safePaper} 图册：总览 + ${Math.max(1, splitPlan.pagesX * splitPlan.pagesY)} 张分页详图`,
        paperX + 36,
        paperY + paperH - 54
      );
    });

    return this.canvasToTempFileAsync("exportCanvas", width, height);
  },
  async refreshExportPreview() {
    if (!this.data.showExportPanel || !this.data.hasEditableGrid) return;
    const format = this.data.exportFormat;
    const mode = this.data.exportMode;
    const summary = this.buildExportSummary(format, mode);
    const previewToken = Date.now();
    this.exportPreviewToken = previewToken;

    this.setData({
      exportPreviewBusy: true,
      exportPreviewTitle: summary.title,
      exportPreviewDesc: summary.desc,
      exportLargeHint: summary.largeHint,
      exportPanelHint: format === "png"
        ? "导出图片会在小程序本地生成，格内色号跟随当前“色号”开关。"
        : (this.canUsePdfExport()
          ? `导出图册会按 ${this.data.exportPdfPaperSize === "A3" ? "A3" : "A4"} 分页生成高清 PDF，并在手机里直接打开。`
          : "图册预览已就绪；如需真正导出图册 PDF，请先在 app.globalData.pdfExportBaseUrl 配置服务域名。"),
      exportPrimaryText: format === "png" ? "导出图片到相册" : "导出图册 PDF",
      pdfExportReady: this.canUsePdfExport()
    });

    try {
      const previewPath = format === "png"
        ? await this.renderPosterExportImage(mode, true)
        : await this.renderPdfPreviewImage(mode, EXPORT_PREVIEW_WIDTH, this.data.exportPdfPaperSize || "A4");

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
    const format = this.exportSettings && this.exportSettings.format === "png" ? "png" : "pdf";
    const mode = this.getActiveExportMode(format);
    await this.setDataAsync({
      showExportPanel: true,
      exportFormat: format,
      exportMode: mode,
      exportModeOptions: this.buildExportModeOptions(format),
      exportPdfPaperSize: this.exportSettings && this.exportSettings.pdfPaperSize === "A3" ? "A3" : "A4",
      exportPdfPaperOptions: this.buildPdfPaperOptions(),
      exportPreviewPath: "",
      pdfExportReady: this.canUsePdfExport(),
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
    this.setData({
      showExportPanel: false,
      exportPreviewBusy: false,
      exportBusy: false,
      showExportPreviewViewer: false,
      exportViewerBusy: false
    }, () => this.requestRedraw(false));
  },
  handleExportFormatSelect(event) {
    const format = event.currentTarget.dataset.format === "png" ? "png" : "pdf";
    const mode = this.getActiveExportMode(format);
    this.exportSettings.format = format;
    this.persistExportSettings();
    this.setData({
      exportFormat: format,
      exportMode: mode,
      exportModeOptions: this.buildExportModeOptions(format),
      exportPdfPaperSize: this.exportSettings && this.exportSettings.pdfPaperSize === "A3" ? "A3" : "A4",
      exportPdfPaperOptions: this.buildPdfPaperOptions(),
      showExportPreviewViewer: false
    }, () => {
      this.exportViewerCacheKey = "";
      this.exportViewerPath = "";
      this.refreshExportPreview();
    });
  },
  handleExportModeSelect(event) {
    const value = event.currentTarget.dataset.mode;
    const format = this.data.exportFormat === "png" ? "png" : "pdf";
    if (format === "png") {
      this.exportSettings.pngMode = value === "standard" ? "standard" : "ultra";
    } else {
      this.exportSettings.pdfMode = value === "ultra" ? "ultra" : "a4";
    }
    this.persistExportSettings();
    this.setData({
      exportMode: this.getActiveExportMode(format),
      showExportPreviewViewer: false
    }, () => {
      this.exportViewerCacheKey = "";
      this.exportViewerPath = "";
      this.refreshExportPreview();
    });
  },
  handleExportPaperSizeSelect(event) {
    const value = event.currentTarget.dataset.paper === "A3" ? "A3" : "A4";
    this.exportSettings.pdfPaperSize = value;
    this.persistExportSettings();
    this.setData({
      exportPdfPaperSize: value,
      showExportPreviewViewer: false
    }, () => {
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
  async buildExportViewerPath(format, mode, paperSize = "A4") {
    if (format === "png") {
      return this.renderPosterExportImage(mode, false);
    }
    return this.renderPdfPreviewImage(mode, EXPORT_PREVIEW_HD_WIDTH, paperSize);
  },
  closeExportPreviewViewer() {
    this.setData({ showExportPreviewViewer: false }, () => this.requestRedraw(false));
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
    const format = this.data.exportFormat === "png" ? "png" : "pdf";
    const mode = this.data.exportMode;
    const paperSize = this.data.exportPdfPaperSize === "A3" ? "A3" : "A4";
    const cacheKey = `${format}:${mode}:${paperSize}`;

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
      const previewPath = await this.buildExportViewerPath(format, mode, paperSize);
      const info = await this.getImageInfo(previewPath).catch(() => null);
      const baseWidth = this.computeViewerBaseWidth(info && info.width);

      this.exportViewerCacheKey = cacheKey;
      this.exportViewerPath = previewPath;
      this.setData({
        exportViewerPath: previewPath,
        exportViewerBusy: false,
        exportViewerBaseWidth: baseWidth,
        exportViewerHint: format === "png"
          ? "这是导出图片的高清预览，可直接核对像素、色号和颗粒统计。"
          : "这是导出图册的页面预览；确认后可直接导出 PDF。"
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
  buildPdfExportPayload(mode) {
    const legend = this.getExportLegend();
    const grid = [];
    const codeGrid = [];
    for (let row = 0; row < this.gridSize; row += 1) {
      const gridRow = [];
      const codeRow = [];
      for (let col = 0; col < this.gridSize; col += 1) {
        const index = row * this.gridSize + col;
        const colorIndex = this.gridIndexes[index];
        if (this.isBackgroundCell(colorIndex)) {
          gridRow.push(null);
          codeRow.push(null);
          continue;
        }
        gridRow.push(this.cellColorByIndex(colorIndex));
        codeRow.push(this.data.showColorCodeInEdit ? this.getCellExportLabel(index) : this.getPaletteColor(colorIndex).code);
      }
      grid.push(gridRow);
      codeGrid.push(codeRow);
    }
    return {
      grid,
      legend,
      codeGrid: this.data.showColorCodeInEdit ? codeGrid : null,
      title: this.data.workName || "Bead Pattern",
      pdfMode: mode === "ultra" ? "ultra" : "a4",
      pdfPaperSize: this.data.exportPdfPaperSize === "A3" ? "A3" : "A4"
    };
  },
  requestPdfExport(payload) {
    const baseUrl = this.getPdfExportBaseUrl();
    if (!baseUrl) {
      return Promise.reject(new Error("pdf-export-url-missing"));
    }
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl}/api/export-pdf`,
        method: "POST",
        data: payload,
        responseType: "arraybuffer",
        header: {
          "content-type": "application/json"
        },
        success: (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300 || !res.data) {
            reject(new Error(`pdf-export-status-${res.statusCode}`));
            return;
          }
          resolve(res.data);
        },
        fail: reject
      });
    });
  },
  writePdfFile(arrayBuffer) {
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/bead-pattern-${Date.now()}.pdf`;
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: arrayBuffer,
        success: () => resolve(filePath),
        fail: reject
      });
    });
  },
  async exportPdf(mode) {
    const payload = this.buildPdfExportPayload(mode);
    const arrayBuffer = await this.requestPdfExport(payload);
    const filePath = await this.writePdfFile(arrayBuffer);
    return new Promise((resolve, reject) => {
      wx.openDocument({
        filePath,
        fileType: "pdf",
        showMenu: true,
        success: () => resolve(filePath),
        fail: reject
      });
    });
  },
  async renderExportPng(mode = "ultra") {
    if (!this.gridSize || !this.gridIndexes.length) {
      throw new Error("empty grid");
    }
    return this.renderPosterExportImage(mode, false);
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
  async handleExportConfirm() {
    if (this.data.exportBusy) return;
    const format = this.data.exportFormat === "png" ? "png" : "pdf";
    const mode = this.data.exportMode;
    this.setData({ exportBusy: true });
    wx.showLoading({ title: "导出中", mask: true });

    try {
      if (format === "png") {
        const pngPath = await this.renderExportPng(mode);
        this.persistEditedWork(pngPath);
        await this.saveImageToAlbum(pngPath);
        wx.showToast({ title: "导出图片已保存到相册", icon: "success" });
      } else {
        if (!this.canUsePdfExport()) {
          throw new Error("pdf-export-url-missing");
        }
        await this.exportPdf(mode);
      }
      this.closeExportPanel();
    } catch (error) {
      console.error("export confirm failed", error);
      wx.showToast({
        title: error && error.message === "pdf-export-url-missing"
          ? "请先配置图册 PDF 服务域名"
          : "导出失败，请重试",
        icon: "none"
      });
    } finally {
      this.setData({ exportBusy: false });
      wx.hideLoading();
    }
  },
  async handleSaveExport() {
    if (!this.data.hasEditableGrid) {
      wx.showToast({ title: "暂无可导出的图纸", icon: "none" });
      return;
    }
    this.closeEraserMenu();
    this.handleCloseColorPicker();
    this.handleCloseBeadStatsOverlay();
    this.openExportPanel();
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
