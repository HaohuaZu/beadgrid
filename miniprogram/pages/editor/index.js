const { MARD221_COLORS } = require("../../utils/mard221");
const { packIndexGrid, unpackIndexGrid } = require("../../utils/grid-pack");
const { quantizeToPalette } = require("../../utils/pixel-converter");

const STORAGE_KEY = "bead_work_library_v1";
const BACKUP_STORAGE_KEY = "bead_work_library_backup_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";
const MAX_UNDO_STEPS = 25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const MAX_CANVAS_EDGE = 960;
const EDITOR_DATA_SCHEMA_VERSION = 3;

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

function areGridEqual(a, b, total) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (!total || a.length < total || b.length < total) return false;
  for (let i = 0; i < total; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

Page({
  data: {
    workId: "",
    workName: "未命名图纸",
    gridSizeText: "--",
    currentTool: "paint",
    scaleText: "100%",
    hasEditableGrid: false,
    canvasWidth: 900,
    canvasHeight: 900,
    exportCanvasSize: 520,
    selectedColorIndex: 0,
    selectedColorCode: "A1",
    selectedColorHex: "#FFF6D4",
    usedPalette: [],
    fullPalette: []
  },
  onLoad(query) {
    const workId = query && query.workId ? query.workId : "";
    const workName = query && query.name ? decodeURIComponent(query.name) : "未命名图纸";

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
    this.lightDrawRequested = false;
    this.backgroundIndexSet = Object.create(null);
    this.hasManualEdits = false;
    this.interactionMode = "";

    this.setData({
      workId,
      workName,
      fullPalette: this.palette,
      selectedColorIndex: 0,
      selectedColorCode: this.palette[0].code,
      selectedColorHex: this.palette[0].hex
    });

    this.loadWork(workId);
  },
  onReady() {
    this.measureCanvas();
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
    this.persistEditedWork();
  },
  setDataAsync(payload) {
    return new Promise((resolve) => {
      this.setData(payload, resolve);
    });
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
    let drawWidth = gridSize;
    let drawHeight = gridSize;
    let drawX = 0;
    let drawY = 0;
    if (srcRatio > 1) {
      drawHeight = gridSize;
      drawWidth = Math.round(gridSize * srcRatio);
      drawX = Math.floor((gridSize - drawWidth) / 2);
    } else if (srcRatio < 1) {
      drawWidth = gridSize;
      drawHeight = Math.round(gridSize / srcRatio);
      drawY = Math.floor((gridSize - drawHeight) / 2);
    }

    await this.setDataAsync({ exportCanvasSize: gridSize });
    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, gridSize, gridSize);
      ctx.drawImage(imagePath, drawX, drawY, drawWidth, drawHeight);
    });
    const sampled = await this.canvasGetImageDataAsync("exportCanvas", gridSize, gridSize);
    const quantized = quantizeToPalette(sampled.data);
    return quantized.hexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = this.paletteIndexByHex[key];
      return Number.isFinite(mapped) ? mapped : 0;
    });
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
        userEdited: false
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
    const detectedBroken = hasValidGrid ? this.looksShiftedToCorner(indexGridRaw, gridSize) : false;
    const shouldTryPreviewRebuild = Boolean(work.previewImages && (!isUserEdited || detectedBroken));
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
          || !areGridEqual(indexGridRaw, rebuiltGrid, total);
        indexGridRaw = rebuiltGrid;
        if (needPersist) {
          this.persistMigratedEditorData(workId, gridSize, rebuiltGrid, work);
        }
      }
    } else if (hasValidGrid && (!hasPackedGrid || editorVersion < EDITOR_DATA_SCHEMA_VERSION)) {
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
    this.hasManualEdits = false;

    const used = this.computeUsedColorIndexes();
    const initialColor = used.length ? used[0] : 0;

    this.setData({
      workName: work.title || this.data.workName,
      gridSizeText: `${gridSize}×${gridSize}`,
      hasEditableGrid: true,
      usedPalette: this.buildPaletteByIndexes(used),
      selectedColorIndex: initialColor,
      selectedColorCode: this.getPaletteColor(initialColor).code,
      selectedColorHex: this.getPaletteColor(initialColor).hex
    });

    this.centerByGridCenter(1);

    if (this.canvasReady) {
      this.requestRedraw(false);
    }
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
          this.canvasReady = true;
          if (this.data.hasEditableGrid) this.centerByGridCenter(1);
          this.requestRedraw(false);
        }
      );
    });
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
    this.setData({
      usedPalette: this.buildPaletteByIndexes(this.computeUsedColorIndexes())
    });
  },
  handleStageTouchMove() {
    // 拦截画布区域触摸滚动，防止页面随手势上下移动
  },
  updateScaleText() {
    this.setData({ scaleText: `${Math.round(this.scale * 100)}%` });
  },
  centerByGridCenter(scale = 1) {
    const safeScale = clamp(scale, MIN_SCALE, MAX_SCALE);
    this.scale = safeScale;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateScaleText();
  },
  getBaseCell() {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const safeGrid = this.gridSize || 1;
    return Math.max(4, Math.floor((Math.min(canvasWidth, canvasHeight) - 24) / safeGrid));
  },
  getBoardMetrics(scale = this.scale, offsetX = this.offsetX, offsetY = this.offsetY) {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const safeGrid = this.gridSize || 1;
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(2, baseCell * scale);
    const boardSize = drawCell * safeGrid;
    const originX = (canvasWidth - boardSize) / 2 + offsetX;
    const originY = (canvasHeight - boardSize) / 2 + offsetY;
    return {
      drawCell,
      boardSize,
      originX,
      originY,
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
        if (!Number.isFinite(idx) || idx < 0 || this.isNearWhiteByIndex(idx)) continue;
        const nextCol = col + shiftCol;
        const nextRow = row + shiftRow;
        if (nextCol < 0 || nextRow < 0 || nextCol >= size || nextRow >= size) continue;
        output[nextRow * size + nextCol] = idx;
      }
    }
    return output;
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
    const topCount = entries[0].count || 1;
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
    } else {
      const topIndex = entries[0].index;
      set[String(topIndex)] = true;
      for (let i = 0; i < entries.length; i += 1) {
        const item = entries[i];
        if (item.count < Math.max(3, Math.floor(topCount * 0.28))) continue;
        set[String(item.index)] = true;
      }
    }

    return set;
  },
  isBackgroundCell(index) {
    if (!Number.isFinite(index) || index < 0) return true;
    if (this.backgroundIndexSet && this.backgroundIndexSet[String(index)]) {
      return true;
    }
    const hex = String(this.cellColorByIndex(index) || "").toUpperCase();
    return hex === "#FFFFFF";
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
    return clamp(scale, MIN_SCALE, MAX_SCALE);
  },
  centerContent(scale = null) {
    const bounds = this.computePrimaryContentBounds() || this.computeContentBounds();
    const resolvedScale = Number.isFinite(scale) ? scale : this.getAutoFitScale(bounds);
    const safeScale = clamp(resolvedScale, MIN_SCALE, MAX_SCALE);
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

    const { drawCell, originX, originY, canvasWidth, canvasHeight } = this.getBoardMetrics();
    const ctx = wx.createCanvasContext("editorCanvas", this);
    const dragLikeMode = lightMode && (this.interactionMode === "move" || this.interactionMode === "pinch");

    ctx.setFillStyle("#FFFFFF");
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (this.data.hasEditableGrid && this.gridSize > 0 && this.gridIndexes.length) {
      let lastColor = "";
      for (let row = 0; row < this.gridSize; row += 1) {
        for (let col = 0; col < this.gridSize; col += 1) {
          const index = row * this.gridSize + col;
          const color = this.cellColorByIndex(this.gridIndexes[index]);
          if (color !== lastColor) {
            ctx.setFillStyle(color);
            lastColor = color;
          }
          ctx.fillRect(originX + col * drawCell, originY + row * drawCell, drawCell, drawCell);
        }
      }

      if (drawCell >= 4) {
        if (!dragLikeMode) {
          ctx.beginPath();
          for (let i = 0; i <= this.gridSize; i += 1) {
            if (i % 5 === 0) continue;
            const p = i * drawCell;
            ctx.moveTo(originX + p, originY);
            ctx.lineTo(originX + p, originY + this.gridSize * drawCell);
            ctx.moveTo(originX, originY + p);
            ctx.lineTo(originX + this.gridSize * drawCell, originY + p);
          }
          ctx.setLineWidth(0.8);
          ctx.setStrokeStyle("rgba(31,36,48,0.18)");
          ctx.stroke();
        }

        ctx.beginPath();
        for (let i = 0; i <= this.gridSize; i += 5) {
          const p = i * drawCell;
          ctx.moveTo(originX + p, originY);
          ctx.lineTo(originX + p, originY + this.gridSize * drawCell);
          ctx.moveTo(originX, originY + p);
          ctx.lineTo(originX + this.gridSize * drawCell, originY + p);
        }
        ctx.setLineWidth(1.2);
        ctx.setStrokeStyle("rgba(31,36,48,0.32)");
        ctx.stroke();
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
    const { drawCell, originX, originY } = this.getBoardMetrics();
    const x = (point.x - originX) / drawCell;
    const y = (point.y - originY) / drawCell;
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || row < 0 || col >= this.gridSize || row >= this.gridSize) return null;
    return {
      col,
      row,
      index: row * this.gridSize + col
    };
  },
  drawLiveChangedCells(changedCells) {
    if (!this.canvasReady || !Array.isArray(changedCells) || !changedCells.length || !this.gridSize) return;
    const { drawCell, originX, originY } = this.getBoardMetrics();
    if (drawCell < 2) return;

    const ctx = wx.createCanvasContext("editorCanvas", this);
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

      const index = row * this.gridSize + col;
      const color = this.cellColorByIndex(this.gridIndexes[index]);
      const x = originX + col * drawCell;
      const y = originY + row * drawCell;
      ctx.setFillStyle(color);
      ctx.fillRect(x, y, drawCell, drawCell);

      markV(col, row, row + 1);
      markV(col + 1, row, row + 1);
      markH(row, col, col + 1);
      markH(row + 1, col, col + 1);
    }

    const lines = Object.keys(lineMarks).map((key) => lineMarks[key]);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.t === "v") {
        const x = originX + line.xIndex * drawCell;
        const y1 = originY + line.fromY * drawCell;
        const y2 = originY + line.toY * drawCell;
        const major = line.xIndex % 5 === 0;
        ctx.beginPath();
        ctx.setLineWidth(major ? 1.2 : 0.8);
        ctx.setStrokeStyle(major ? "rgba(31,36,48,0.32)" : "rgba(31,36,48,0.18)");
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
      } else {
        const y = originY + line.yIndex * drawCell;
        const x1 = originX + line.fromX * drawCell;
        const x2 = originX + line.toX * drawCell;
        const major = line.yIndex % 5 === 0;
        ctx.beginPath();
        ctx.setLineWidth(major ? 1.2 : 0.8);
        ctx.setStrokeStyle(major ? "rgba(31,36,48,0.32)" : "rgba(31,36,48,0.18)");
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
    }

    ctx.draw(true);
  },
  applyScaleWithAnchor(nextScale, anchorCanvasPoint, anchorBoardX, anchorBoardY) {
    const safeScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const baseCell = this.getBaseCell();
    const drawCell = Math.max(2, baseCell * safeScale);
    const boardSize = drawCell * this.gridSize;
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const centerOriginX = (canvasWidth - boardSize) / 2;
    const centerOriginY = (canvasHeight - boardSize) / 2;
    const originX = anchorCanvasPoint.x - anchorBoardX * drawCell;
    const originY = anchorCanvasPoint.y - anchorBoardY * drawCell;

    this.scale = safeScale;
    this.offsetX = originX - centerOriginX;
    this.offsetY = originY - centerOriginY;
    this.updateScaleText();
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
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize: this.gridSize,
        indexGridPacked: packIndexGrid(this.gridIndexes, this.palette.length - 1),
        usedColorIndexes,
        backgroundHex: "#FFFFFF",
        userEdited: Boolean((work.editorData && work.editorData.userEdited) || this.hasManualEdits)
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
    if (!tool || tool === this.data.currentTool) return;
    this.setData({ currentTool: tool });
  },
  handlePickColor(event) {
    const raw = event.currentTarget.dataset.index;
    const index = toNumber(raw, 0);
    if (index < 0 || index >= this.palette.length) return;
    const color = this.getPaletteColor(index);
    this.setData({
      selectedColorIndex: index,
      selectedColorCode: color.code,
      selectedColorHex: color.hex,
      currentTool: this.data.currentTool === "erase" ? "paint" : this.data.currentTool
    });
  },
  handleCanvasTouchStart(event) {
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

    if (this.touchState.type === "move") {
      const dx = point.x - this.touchState.startPoint.x;
      const dy = point.y - this.touchState.startPoint.y;
      const nextOffsetX = this.touchState.startOffsetX + dx;
      const nextOffsetY = this.touchState.startOffsetY + dy;
      if (Math.abs(nextOffsetX - this.offsetX) < 0.8 && Math.abs(nextOffsetY - this.offsetY) < 0.8) return;
      this.offsetX = nextOffsetX;
      this.offsetY = nextOffsetY;
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
    if (this.touchState && this.touchState.type === "paint" && this.touchState.hasChanged) {
      this.commitStrokeChanges(this.touchState.changes);
      this.refreshUsedPalette();
      this.schedulePersist();
    }
    this.touchState = null;
    this.interactionMode = "";
    this.requestRedraw(false);
  },
  handleZoomTap(event) {
    const action = event.currentTarget.dataset.action;
    const delta = action === "in" ? 0.2 : -0.2;
    const nextScale = clamp(this.scale + delta, MIN_SCALE, MAX_SCALE);

    const center = {
      x: this.data.canvasWidth / 2,
      y: this.data.canvasHeight / 2
    };
    const { drawCell, originX, originY } = this.getBoardMetrics();
    const anchorBoardX = (center.x - originX) / drawCell;
    const anchorBoardY = (center.y - originY) / drawCell;
    this.applyScaleWithAnchor(nextScale, center, anchorBoardX, anchorBoardY);
    this.requestRedraw(false);
  },
  handleResetView() {
    this.centerByGridCenter(1);
    this.requestRedraw(false);
  },
  handleUndo() {
    if (!this.undoStack.length) {
      wx.showToast({ title: "没有可撤销步骤", icon: "none" });
      return;
    }
    const patch = this.undoStack.pop();
    this.applyPatch(patch, "undo");
    this.hasManualEdits = true;
    this.redoStack.push(patch);
    this.refreshUsedPalette();
    this.requestRedraw(false);
    this.schedulePersist();
  },
  handleRedo() {
    if (!this.redoStack.length) {
      wx.showToast({ title: "没有可重做步骤", icon: "none" });
      return;
    }
    const patch = this.redoStack.pop();
    this.applyPatch(patch, "redo");
    this.hasManualEdits = true;
    this.undoStack.push(patch);
    this.refreshUsedPalette();
    this.requestRedraw(false);
    this.schedulePersist();
  },
  async renderExportPng(withGrid = true) {
    if (!this.gridSize || !this.gridIndexes.length) {
      throw new Error("empty grid");
    }

    const cellSize = this.gridSize <= 32 ? 16 : this.gridSize <= 52 ? 12 : 10;
    const canvasSize = this.gridSize * cellSize;
    await this.setDataAsync({ exportCanvasSize: canvasSize });

    await this.drawCanvasAsync("exportCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      let lastColor = "";
      for (let row = 0; row < this.gridSize; row += 1) {
        for (let col = 0; col < this.gridSize; col += 1) {
          const index = row * this.gridSize + col;
          const color = this.cellColorByIndex(this.gridIndexes[index]);
          if (color !== lastColor) {
            ctx.setFillStyle(color);
            lastColor = color;
          }
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }

      if (withGrid) {
        for (let i = 0; i <= this.gridSize; i += 1) {
          const pos = i * cellSize;
          const major = i % 5 === 0;
          ctx.beginPath();
          ctx.setLineWidth(major ? 1.6 : 0.8);
          ctx.setStrokeStyle(major ? "rgba(15,23,42,0.48)" : "rgba(15,23,42,0.2)");
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, canvasSize);
          ctx.stroke();

          ctx.beginPath();
          ctx.setLineWidth(major ? 1.6 : 0.8);
          ctx.setStrokeStyle(major ? "rgba(15,23,42,0.48)" : "rgba(15,23,42,0.2)");
          ctx.moveTo(0, pos);
          ctx.lineTo(canvasSize, pos);
          ctx.stroke();
        }
      }
    });

    return this.canvasToTempFileAsync("exportCanvas", canvasSize, canvasSize);
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
  async handleSaveExport() {
    if (!this.data.hasEditableGrid) {
      wx.showToast({ title: "暂无可导出的图纸", icon: "none" });
      return;
    }

    wx.showActionSheet({
      itemList: ["保存PNG到相册", "预览PNG"],
      success: async (res) => {
        const shouldSave = res.tapIndex === 0;
        wx.showLoading({ title: "导出中", mask: true });
        try {
          const pngPath = await this.renderExportPng(true);
          this.persistEditedWork(pngPath);

          if (shouldSave) {
            await this.saveImageToAlbum(pngPath);
            wx.showToast({ title: "PNG已保存到相册", icon: "success" });
            return;
          }

          wx.previewImage({
            current: pngPath,
            urls: [pngPath]
          });
        } catch (error) {
          console.error("export png failed", error);
          wx.showToast({ title: "导出失败，请重试", icon: "none" });
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});
