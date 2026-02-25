const { MARD221_COLORS } = require("../../utils/mard221");
const { unpackIndexGrid } = require("../../utils/grid-pack");

const STORAGE_KEY = "bead_work_library_v1";
const BACKUP_STORAGE_KEY = "bead_work_library_backup_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";

const MAX_CANVAS_EDGE = 2000;
const AXIS_RING_CELLS = 1;
const WHITE_RING_CELLS = 1;
const TAP_MOVE_SLOP = 8;

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

Page({
  data: {
    workId: "",
    workName: "拼豆模式",
    gridSizeText: "--",
    hasGrid: false,
    canvasWidth: 900,
    canvasHeight: 900,
    showScaleOverlay: false,
    scaleText: "100%",
    beadStats: [],
    beadHighlightIndex: -1,
    currentHighlightCode: "无",
    currentHighlightHex: "#F2F4F7",
    showAllBeadStats: false
  },
  onLoad(query) {
    const workId = query && query.workId ? query.workId : "";
    const workName = query && query.name ? decodeURIComponent(query.name) : "拼豆模式";

    this.palette = (Array.isArray(MARD221_COLORS) ? MARD221_COLORS : [])
      .filter((item) => item && item.hex)
      .sort((a, b) => (toNumber(a.order, 0) - toNumber(b.order, 0)))
      .map((item, index) => ({
        index,
        code: item.code || `C${index + 1}`,
        hex: String(item.hex || "#FFFFFF").toUpperCase(),
        order: toNumber(item.order, index + 1)
      }));
    if (!this.palette.length) {
      this.palette = [{ index: 0, code: "A1", hex: "#FFFFFF", order: 1 }];
    }

    this.gridSize = 0;
    this.gridIndexes = [];
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.canvasReady = false;
    this.canvasRect = null;
    this.canvasRatioX = 1;
    this.canvasRatioY = 1;
    this.touchState = null;
    this.redrawTimer = null;
    this.lightDrawRequested = false;
    this.interactionMode = "";
    this.scaleOverlayTimer = null;
    this.backgroundIndexSet = Object.create(null);
    this.beadCellLabels = [];
    this.viewRowStart = 0;
    this.viewColStart = 0;
    this.viewRows = 0;
    this.viewCols = 0;

    this.setData({
      workId,
      workName,
      beadHighlightIndex: -1,
      currentHighlightCode: "无",
      currentHighlightHex: "#F2F4F7",
      showAllBeadStats: false,
      beadStats: []
    });
    this.loadWork(workId);
  },
  onReady() {
    this.measureCanvas();
    wx.showToast({
      title: "拼豆模式：边缘坐标 + 拖拽缩放查看",
      icon: "none",
      duration: 1600
    });
  },
  onUnload() {
    if (this.redrawTimer) {
      clearTimeout(this.redrawTimer);
      this.redrawTimer = null;
    }
    if (this.scaleOverlayTimer) {
      clearTimeout(this.scaleOverlayTimer);
      this.scaleOverlayTimer = null;
    }
  },
  getRuntimeWorkCache() {
    const app = getApp && getApp();
    if (!app || !app.globalData) return [];
    const cache = app.globalData.createWorkLibraryCache;
    return Array.isArray(cache) ? cache : [];
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
  loadWork(workId) {
    if (!workId) {
      this.setData({ hasGrid: false });
      wx.showToast({ title: "作品不存在", icon: "none" });
      return;
    }
    const workLibrary = this.readWorkLibrary();
    const work = workLibrary.find((item) => item && item.id === workId);
    if (!work) {
      this.setData({ hasGrid: false });
      wx.showToast({ title: "作品不存在", icon: "none" });
      return;
    }
    const editorData = work.editorData && typeof work.editorData === "object" ? work.editorData : null;
    const gridSize = toNumber(editorData && editorData.gridSize) || parseGridSizeFromText(work.size);
    const total = gridSize * gridSize;
    const packed = editorData && typeof editorData.indexGridPacked === "string" ? editorData.indexGridPacked : "";
    const legacyIndexGrid = editorData && Array.isArray(editorData.indexGrid) ? editorData.indexGrid : [];
    const indexGridRaw = packed
      ? unpackIndexGrid(packed, total, this.palette.length - 1)
      : legacyIndexGrid.slice(0, total).map((item) => {
        const idx = toNumber(item, 0);
        if (idx === -1) return -1;
        if (idx < 0 || idx >= this.palette.length) return 0;
        return idx;
      });

    if (!gridSize || !total || !Array.isArray(indexGridRaw) || indexGridRaw.length < total) {
      this.setData({ hasGrid: false });
      wx.showToast({ title: "该作品缺少拼豆数据", icon: "none" });
      return;
    }

    this.gridSize = gridSize;
    this.gridIndexes = indexGridRaw.slice(0, total);
    this.backgroundIndexSet = this.computeBackgroundIndexSet();
    const visible = this.computeVisibleBounds();
    this.viewRowStart = visible.rowStart;
    this.viewColStart = visible.colStart;
    this.viewRows = visible.rows;
    this.viewCols = visible.cols;

    this.setData({
      workName: work.title || this.data.workName,
      gridSizeText: `${gridSize}×${gridSize}`,
      hasGrid: true
    });

    this.centerByGridCenter(1);
    this.refreshBeadMetrics();
    if (this.canvasReady) this.requestRedraw(false);
  },
  getPaletteColor(index) {
    if (!Number.isFinite(index) || index < 0 || index >= this.palette.length) {
      return { index: 0, code: this.palette[0].code, hex: this.palette[0].hex };
    }
    return this.palette[index];
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
  computeBackgroundIndexSet() {
    const set = Object.create(null);
    set["-1"] = true;
    // Keep rule strict and stable: only transparent/explicit white is treated as background.
    for (let i = 0; i < this.palette.length; i += 1) {
      const hex = String((this.palette[i] && this.palette[i].hex) || "").toUpperCase();
      if (hex === "#FFFFFF") {
        set[String(i)] = true;
      }
    }
    return set;
  },
  isBackgroundCell(index) {
    if (!Number.isFinite(index) || index < 0) return true;
    if (this.backgroundIndexSet && this.backgroundIndexSet[String(index)]) return true;
    const hex = String(this.cellColorByIndex(index) || "").toUpperCase();
    return hex === "#FFFFFF";
  },
  computeVisibleBounds() {
    const size = this.gridSize || 0;
    if (!size || !Array.isArray(this.gridIndexes) || !this.gridIndexes.length) {
      return { rowStart: 0, colStart: 0, rowEnd: 0, colEnd: 0, rows: 1, cols: 1 };
    }
    let minRow = size;
    let minCol = size;
    let maxRow = -1;
    let maxCol = -1;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const idx = this.gridIndexes[row * size + col];
        if (this.isBackgroundCell(idx)) continue;
        if (row < minRow) minRow = row;
        if (col < minCol) minCol = col;
        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;
      }
    }
    if (maxRow < 0 || maxCol < 0) {
      return {
        rowStart: 0,
        colStart: 0,
        rowEnd: size - 1,
        colEnd: size - 1,
        rows: size,
        cols: size
      };
    }
    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;
    // Fallback for abnormal clipping: keep whole canvas to ensure first-screen completeness.
    if (rows < Math.max(8, Math.floor(size * 0.35)) || cols < Math.max(8, Math.floor(size * 0.35))) {
      return {
        rowStart: 0,
        colStart: 0,
        rowEnd: size - 1,
        colEnd: size - 1,
        rows: size,
        cols: size
      };
    }
    return {
      rowStart: minRow,
      colStart: minCol,
      rowEnd: maxRow,
      colEnd: maxCol,
      rows,
      cols
    };
  },
  getTextColorByIndex(index) {
    const color = this.getPaletteColor(index);
    const hex = String((color && color.hex) || "#FFFFFF").replace("#", "");
    if (hex.length !== 6) return "#1F2430";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance <= 126 ? "#FFFFFF" : "#111111";
  },
  getTextStrokeColorByIndex(index) {
    return this.getTextColorByIndex(index);
  },
  computeBeadStatsAndLabels() {
    const total = this.gridSize * this.gridSize;
    const labels = new Array(total).fill("");
    const counter = Object.create(null);
    for (let i = 0; i < total; i += 1) {
      const idx = this.gridIndexes[i];
      if (this.isBackgroundCell(idx)) continue;
      const key = String(idx);
      counter[key] = (counter[key] || 0) + 1;
    }
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
    const stats = Object.keys(counter)
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
    return { stats, labels };
  },
  refreshBeadMetrics() {
    this.backgroundIndexSet = this.computeBackgroundIndexSet();
    const metrics = this.computeBeadStatsAndLabels();
    this.beadCellLabels = metrics.labels;
    const stillExists = metrics.stats.some((item) => item.index === this.data.beadHighlightIndex);
    const nextHighlightIndex = stillExists ? this.data.beadHighlightIndex : -1;
    const nextHighlight = nextHighlightIndex >= 0 ? this.getPaletteColor(nextHighlightIndex) : null;
    this.setData({
      beadStats: metrics.stats,
      beadHighlightIndex: nextHighlightIndex,
      currentHighlightCode: nextHighlight ? nextHighlight.code : "无",
      currentHighlightHex: nextHighlight ? nextHighlight.hex : "#F2F4F7"
    });
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
      this.setData({
        canvasWidth,
        canvasHeight
      }, () => {
        this.canvasReady = true;
        if (this.data.hasGrid) this.centerByGridCenter(this.scale || 1);
        this.requestRedraw(false);
      });
    });
  },
  getBaseCell() {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const contentRows = Math.max(1, this.viewRows || this.gridSize || 1);
    const contentCols = Math.max(1, this.viewCols || this.gridSize || 1);
    const boardRows = contentRows + WHITE_RING_CELLS * 2;
    const boardCols = contentCols + WHITE_RING_CELLS * 2;
    const totalRows = boardRows + AXIS_RING_CELLS * 2;
    const totalCols = boardCols + AXIS_RING_CELLS * 2;
    const cellByWidth = (canvasWidth - 24) / totalCols;
    const cellByHeight = (canvasHeight - 24) / totalRows;
    return Math.max(4, Math.floor(Math.min(cellByWidth, cellByHeight)));
  },
  getScaleLimits() {
    // Min: board fits exactly in canvas (scale = 1.0)
    // Max: ~3-4 content cells visible across the shorter canvas edge
    const baseCell = this.getBaseCell();
    const canvasEdge = Math.min(this.data.canvasWidth, this.data.canvasHeight);
    const maxScale = Math.max(1, canvasEdge / (baseCell * 3));
    return { minScale: 1, maxScale };
  },
  getBoardMetrics(scale = this.scale, offsetX = this.offsetX, offsetY = this.offsetY) {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const contentRows = Math.max(1, this.viewRows || this.gridSize || 1);
    const contentCols = Math.max(1, this.viewCols || this.gridSize || 1);
    const boardRows = contentRows + WHITE_RING_CELLS * 2;
    const boardCols = contentCols + WHITE_RING_CELLS * 2;
    const totalRows = boardRows + AXIS_RING_CELLS * 2;
    const totalCols = boardCols + AXIS_RING_CELLS * 2;
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(2, baseCell * scale);
    const boardWidth = drawCell * boardCols;
    const boardHeight = drawCell * boardRows;
    const outerWidth = drawCell * totalCols;
    const outerHeight = drawCell * totalRows;
    const outerOriginX = (canvasWidth - outerWidth) / 2 + offsetX;
    const outerOriginY = (canvasHeight - outerHeight) / 2 + offsetY;
    const boardOriginX = outerOriginX + AXIS_RING_CELLS * drawCell;
    const boardOriginY = outerOriginY + AXIS_RING_CELLS * drawCell;
    const originX = boardOriginX + WHITE_RING_CELLS * drawCell;
    const originY = boardOriginY + WHITE_RING_CELLS * drawCell;
    return {
      drawCell,
      boardWidth,
      boardHeight,
      outerWidth,
      outerHeight,
      outerOriginX,
      outerOriginY,
      boardOriginX,
      boardOriginY,
      totalRows,
      totalCols,
      boardRows,
      boardCols,
      contentRows,
      contentCols,
      originX,
      originY,
      canvasWidth,
      canvasHeight
    };
  },
  centerByGridCenter(scale = 1) {
    const { minScale, maxScale } = this.getScaleLimits();
    this.scale = clamp(scale, minScale, maxScale);
    this.offsetX = 0;
    this.offsetY = 0;
  },
  clampOffset() {
    // Prevent the board from drifting too far off-canvas.
    // Rule: at least 30% of the board (or 50% of canvas) must remain visible.
    const { outerWidth, outerHeight, canvasWidth, canvasHeight } = this.getBoardMetrics();
    const keepX = Math.min(outerWidth * 0.7, canvasWidth * 0.7);
    const keepY = Math.min(outerHeight * 0.7, canvasHeight * 0.7);
    const maxOX = (canvasWidth + outerWidth) / 2 - keepX;
    const maxOY = (canvasHeight + outerHeight) / 2 - keepY;
    this.offsetX = clamp(this.offsetX, -maxOX, maxOX);
    this.offsetY = clamp(this.offsetY, -maxOY, maxOY);
  },
  requestRedraw(lightMode = false) {
    if (!this.canvasReady) return;
    if (lightMode) this.lightDrawRequested = true;
    else this.lightDrawRequested = false;
    if (this.redrawTimer) return;
    this.redrawTimer = setTimeout(() => {
      const useLight = this.lightDrawRequested;
      this.lightDrawRequested = false;
      this.redrawTimer = null;
      this.redrawCanvas(useLight);
    }, 10);
  },
  redrawCanvas(lightMode = false) {
    if (!this.canvasReady) return;
    const {
      drawCell,
      originX,
      originY,
      outerOriginX,
      outerOriginY,
      outerWidth,
      outerHeight,
      boardOriginX,
      boardOriginY,
      boardWidth,
      boardHeight,
      totalRows,
      totalCols,
      boardRows,
      boardCols,
      contentRows,
      contentCols,
      canvasWidth,
      canvasHeight
    } = this.getBoardMetrics();
    const ctx = wx.createCanvasContext("beadCanvas", this);
    if (typeof ctx.setImageSmoothingEnabled === "function") {
      ctx.setImageSmoothingEnabled(false);
    }
    const highlightIndex = this.data.beadHighlightIndex;
    const fastMode = Boolean(
      lightMode ||
      this.interactionMode === "move" ||
      this.interactionMode === "pinch" ||
      this.interactionMode === "scale"
    );

    ctx.setFillStyle("#FFFFFF");
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.setFillStyle("#FFFFFF");
    ctx.fillRect(outerOriginX, outerOriginY, outerWidth, outerHeight);

    if (this.data.hasGrid && this.gridSize > 0 && this.gridIndexes.length) {
      let lastColor = "";
      for (let row = 0; row < contentRows; row += 1) {
        const rawRow = this.viewRowStart + row;
        let segmentStart = 0;
        let segmentColor = this.cellColorByIndex(
          this.gridIndexes[rawRow * this.gridSize + this.viewColStart]
        );
        for (let col = 1; col <= contentCols; col += 1) {
          const reachedEnd = col === contentCols;
          const color = reachedEnd
            ? ""
            : this.cellColorByIndex(
              this.gridIndexes[rawRow * this.gridSize + this.viewColStart + col]
            );
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

      if (!fastMode && Number.isFinite(highlightIndex) && highlightIndex >= 0) {
        ctx.setFillStyle("rgba(255,255,255,0.82)");
        for (let row = 0; row < contentRows; row += 1) {
          const rawRow = this.viewRowStart + row;
          let segmentStart = -1;
          for (let col = 0; col <= contentCols; col += 1) {
            let shouldDim = false;
            if (col < contentCols) {
              const idx = this.gridIndexes[rawRow * this.gridSize + this.viewColStart + col];
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

      if (!fastMode && drawCell >= 4) {
        // Axis ring with gray background.
        ctx.setFillStyle("#EEF1F5");
        ctx.fillRect(outerOriginX, outerOriginY, outerWidth, drawCell);
        ctx.fillRect(outerOriginX, outerOriginY + outerHeight - drawCell, outerWidth, drawCell);
        ctx.fillRect(outerOriginX, outerOriginY + drawCell, drawCell, outerHeight - drawCell * 2);
        ctx.fillRect(
          outerOriginX + outerWidth - drawCell,
          outerOriginY + drawCell,
          drawCell,
          outerHeight - drawCell * 2
        );

        // Outer ring grid (white margin with coordinates)
        ctx.beginPath();
        for (let i = 0; i <= totalCols; i += 1) {
          const p = i * drawCell;
          const x = Math.round(outerOriginX + p) + 0.5;
          ctx.moveTo(x, outerOriginY);
          ctx.lineTo(x, outerOriginY + outerHeight);
        }
        for (let i = 0; i <= totalRows; i += 1) {
          const p = i * drawCell;
          const y = Math.round(outerOriginY + p) + 0.5;
          ctx.moveTo(outerOriginX, y);
          ctx.lineTo(outerOriginX + outerWidth, y);
        }
        ctx.setLineWidth(0.7);
        ctx.setStrokeStyle("rgba(31,36,48,0.16)");
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= boardCols; i += 1) {
          if (i % 5 === 0) continue;
          const p = i * drawCell;
          const x = Math.round(boardOriginX + p) + 0.5;
          ctx.moveTo(x, boardOriginY);
          ctx.lineTo(x, boardOriginY + boardHeight);
        }
        for (let i = 0; i <= boardRows; i += 1) {
          if (i % 5 === 0) continue;
          const p = i * drawCell;
          const y = Math.round(boardOriginY + p) + 0.5;
          ctx.moveTo(boardOriginX, y);
          ctx.lineTo(boardOriginX + boardWidth, y);
        }
        ctx.setLineWidth(0.8);
        ctx.setStrokeStyle("rgba(31,36,48,0.18)");
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= boardCols; i += 5) {
          const p = i * drawCell;
          const x = Math.round(boardOriginX + p) + 0.5;
          ctx.moveTo(x, boardOriginY);
          ctx.lineTo(x, boardOriginY + boardHeight);
        }
        for (let i = 0; i <= boardRows; i += 5) {
          const p = i * drawCell;
          const y = Math.round(boardOriginY + p) + 0.5;
          ctx.moveTo(boardOriginX, y);
          ctx.lineTo(boardOriginX + boardWidth, y);
        }
        ctx.setLineWidth(1.6);
        ctx.setStrokeStyle("rgba(31,36,48,0.42)");
        ctx.stroke();

        // Emphasize content boundary inside the white ring.
        ctx.beginPath();
        ctx.rect(originX, originY, contentCols * drawCell, contentRows * drawCell);
        ctx.setLineWidth(1.6);
        ctx.setStrokeStyle("rgba(255,59,92,0.45)");
        ctx.stroke();
      }

      // Axis labels on the outer gray ring: 1..N
      if (!fastMode && drawCell >= 2) {
        const axisTextSize = clamp(Math.floor(drawCell * 0.36), 5, 18);
        const axisStep = Math.max(1, Math.ceil((axisTextSize + 2) / Math.max(1, drawCell)));
        const ringTopY = outerOriginY + drawCell / 2;
        const ringBottomY = outerOriginY + outerHeight - drawCell / 2;
        const ringLeftX = outerOriginX + drawCell / 2;
        const ringRightX = outerOriginX + outerWidth - drawCell / 2;

        ctx.setFontSize(axisTextSize);
        ctx.setFillStyle("#5D6778");
        ctx.setTextAlign("center");
        ctx.setTextBaseline("middle");

        for (let c = 0; c < boardCols; c += axisStep) {
          const value = c + 1;
          const x = boardOriginX + c * drawCell + drawCell / 2;
          const label = String(value);
          ctx.fillText(label, x, ringTopY);
          ctx.fillText(label, x, ringBottomY);
        }
        for (let r = 0; r < boardRows; r += axisStep) {
          const value = r + 1;
          const y = boardOriginY + r * drawCell + drawCell / 2;
          const label = String(value);
          ctx.fillText(label, ringLeftX, y);
          ctx.fillText(label, ringRightX, y);
        }
      }

      // Clean label rendering: plain small text directly on cells, no background decorations.
      // Color code at start of each horizontal run, sequential numbers for subsequent cells.
      if (!fastMode && drawCell >= 6) {
        const labels = Array.isArray(this.beadCellLabels) ? this.beadCellLabels : [];
        ctx.setTextAlign("center");
        ctx.setTextBaseline("middle");

        // Text size: small and compact, never overflows cells.
        const textSize = clamp(Math.floor(drawCell * 0.38), 5, 14);
        ctx.setFontSize(textSize);

        let lastFillColor = "";
        for (let row = 0; row < contentRows; row += 1) {
          const rawRow = this.viewRowStart + row;
          for (let col = 0; col < contentCols; col += 1) {
            const rawCol = this.viewColStart + col;
            const index = rawRow * this.gridSize + rawCol;
            const colorIndex = this.gridIndexes[index];
            if (this.isBackgroundCell(colorIndex)) continue;

            // When highlight is active, only label highlighted cells
            const hasHighlight = Number.isFinite(highlightIndex) && highlightIndex >= 0;
            if (hasHighlight && colorIndex !== highlightIndex) continue;

            const label = labels[index] || this.getPaletteColor(colorIndex).code;
            if (!label) continue;

            const textColor = this.getTextColorByIndex(colorIndex);
            if (textColor !== lastFillColor) {
              ctx.setFillStyle(textColor);
              lastFillColor = textColor;
            }
            ctx.fillText(
              label,
              Math.round(originX + col * drawCell + drawCell / 2),
              Math.round(originY + row * drawCell + drawCell / 2)
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
    if (!point || !this.data.hasGrid || !this.gridSize) return null;
    const { drawCell, originX, originY } = this.getBoardMetrics();
    const x = (point.x - originX) / drawCell;
    const y = (point.y - originY) / drawCell;
    const col = Math.floor(x);
    const row = Math.floor(y);
    const contentRows = Math.max(1, this.viewRows || this.gridSize || 1);
    const contentCols = Math.max(1, this.viewCols || this.gridSize || 1);
    if (col < 0 || row < 0 || col >= contentCols || row >= contentRows) return null;
    const rawRow = this.viewRowStart + row;
    const rawCol = this.viewColStart + col;
    return {
      col,
      row,
      index: rawRow * this.gridSize + rawCol
    };
  },
  handleStageTouchMove() {
    // block page scroll while interacting with the canvas
  },
  toggleBeadHighlight(index) {
    if (!Number.isFinite(index) || index < 0) return;
    const next = this.data.beadHighlightIndex === index ? -1 : index;
    const highlight = next >= 0 ? this.getPaletteColor(next) : null;
    this.setData({
      beadHighlightIndex: next,
      currentHighlightCode: highlight ? highlight.code : "无",
      currentHighlightHex: highlight ? highlight.hex : "#F2F4F7"
    }, () => {
      this.requestRedraw(false);
    });
  },
  handleSelectBeadColor(event) {
    const index = toNumber(event.currentTarget.dataset.index, -1);
    if (index < 0) return;
    this.toggleBeadHighlight(index);
  },
  handleToggleBeadStats() {
    this.setData({ showAllBeadStats: !this.data.showAllBeadStats });
  },
  handleCanvasTouchStart(event) {
    if (!this.data.hasGrid) return;
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
    this.touchState = {
      type: "move",
      startPoint: point,
      lastPoint: point,
      startOffsetX: this.offsetX,
      startOffsetY: this.offsetY,
      moved: false
    };
    this.interactionMode = "move";
  },
  handleCanvasTouchMove(event) {
    if (!this.data.hasGrid || !this.touchState) return;
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
    if (!touches.length || this.touchState.type !== "move") return;
    const point = this.toCanvasPoint(touches[0]);
    if (!point) return;
    const dx = point.x - this.touchState.startPoint.x;
    const dy = point.y - this.touchState.startPoint.y;
    if (Math.abs(dx) > TAP_MOVE_SLOP || Math.abs(dy) > TAP_MOVE_SLOP) this.touchState.moved = true;
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
  },
  handleCanvasTouchEnd() {
    if (this.touchState && this.touchState.type === "move" && !this.touchState.moved) {
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
  },
  applyScaleWithAnchor(nextScale, anchorCanvasPoint, anchorBoardX, anchorBoardY) {
    const { minScale, maxScale } = this.getScaleLimits();
    const safeScale = clamp(nextScale, minScale, maxScale);
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(2, baseCell * safeScale);
    const contentRows = Math.max(1, this.viewRows || this.gridSize || 1);
    const contentCols = Math.max(1, this.viewCols || this.gridSize || 1);
    const boardRows = contentRows + WHITE_RING_CELLS * 2;
    const boardCols = contentCols + WHITE_RING_CELLS * 2;
    const totalRows = boardRows + AXIS_RING_CELLS * 2;
    const totalCols = boardCols + AXIS_RING_CELLS * 2;
    const outerWidth = drawCell * totalCols;
    const outerHeight = drawCell * totalRows;
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const centerOuterX = (canvasWidth - outerWidth) / 2;
    const centerOuterY = (canvasHeight - outerHeight) / 2;
    const centerOriginX = centerOuterX + (AXIS_RING_CELLS + WHITE_RING_CELLS) * drawCell;
    const centerOriginY = centerOuterY + (AXIS_RING_CELLS + WHITE_RING_CELLS) * drawCell;
    const originX = anchorCanvasPoint.x - anchorBoardX * drawCell;
    const originY = anchorCanvasPoint.y - anchorBoardY * drawCell;

    this.scale = safeScale;
    this.offsetX = originX - centerOriginX;
    this.offsetY = originY - centerOriginY;
    this.clampOffset();
    this.showScaleOverlayHint();
  },
  showScaleOverlayHint() {
    const nextText = `${Math.round(this.scale * 100)}%`;
    if (this.scaleOverlayTimer) clearTimeout(this.scaleOverlayTimer);
    this.setData({ showScaleOverlay: true, scaleText: nextText });
    this.scaleOverlayTimer = setTimeout(() => {
      this.setData({ showScaleOverlay: false });
      this.scaleOverlayTimer = null;
    }, 650);
  },
  handleResetView() {
    this.centerByGridCenter(1);
    this.requestRedraw(false);
  },
  handleBackToEditor() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    const name = encodeURIComponent(this.data.workName || "");
    wx.navigateTo({
      url: `/pages/editor/index?workId=${this.data.workId || ""}&name=${name}`
    });
  }
});
