const {
  quantizeToPalette,
  formatGridDate
} = require("../../utils/pixel-converter");
const { packIndexGrid } = require("../../utils/grid-pack");
const { MARD221_COLORS } = require("../../utils/mard221");

const STORAGE_KEY = "bead_work_library_v1";
const BACKUP_STORAGE_KEY = "bead_work_library_backup_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";
const STORAGE_SEEDED_KEY = "bead_work_library_seeded_v1";
const MAX_STORED_WORKS = 20;
const MAX_EDITABLE_WORKS = 12;
const MAX_EDITOR_CELLS = 40000;
const DEFAULT_EDITOR_BG = "#FFFFFF";
const EDITOR_DATA_SCHEMA_VERSION = 3;
const EDITOR_PALETTE = (Array.isArray(MARD221_COLORS) ? MARD221_COLORS : [])
  .filter((item) => item && item.hex)
  .sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)));
const EDITOR_MAX_INDEX = Math.max(0, EDITOR_PALETTE.length - 1);
const PALETTE_INDEX_BY_HEX = EDITOR_PALETTE.reduce((acc, item, index) => {
  if (item && item.hex) {
    acc[item.hex.toUpperCase()] = index;
  }
  return acc;
}, Object.create(null));

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
    uploadImagePath: "",
    uploadImageName: "",
    uploadImageSizeText: "",
    uploadPreviewError: false,
    namingDraft: "",
    namingError: "",
    selectedCostMode: "standard",
    selectedStyleMode: "cartoon",
    selectedMaxEdge: "52",
    customMaxEdge: "",
    costHintText: "转换一次花费1拼豆币，当前拼豆币：12",
    styleHintText: "适合拼豆的Q版人物、萌宠等Q版动漫像素风格",
    coinBalance: 12,
    totalCloneCount: 0,
    isConverting: false,
    processCanvasSize: 52,
    renderCanvasSize: 520,
    workLibrary: DEMO_WORK_LIBRARY,
    displayWorks: []
  },
  onLoad() {
    this.loadWorkLibrary();
  },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({ selected: 1 });
    }
    this.refreshDisplayWorks();
    this.syncSummary();

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
  },
  onHide() {
    if (this.isPickingImage) return;
    if (this.data.showUploadModal || this.data.showWorkPreviewModal) {
      this.handleCloseModal();
      this.handleCloseWorkPreview();
    }
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
    return {
      id: work.id || `w-${Date.now()}-${index}`,
      title: work.title || "AI生成拼豆作品",
      date: work.date || formatGridDate(),
      createdAt: Number(work.createdAt) || (now - index * 1000),
      size: work.size || "52x52",
      style: work.style || "精致像素",
      status: work.status || "已完成",
      isGenerating: Boolean(work.isGenerating),
      isFailed: Boolean(work.isFailed),
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
  serializeWork(work, index = 0) {
    const normalized = this.normalizeWork(work, index);
    return {
      id: normalized.id,
      title: normalized.title,
      date: normalized.date,
      createdAt: normalized.createdAt,
      size: normalized.size,
      style: normalized.style,
      status: normalized.status,
      isGenerating: normalized.isGenerating,
      isFailed: normalized.isFailed,
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
    return [...source].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  },
  computeDisplayWorks(workLibrary) {
    return this.sortWorkLibrary(workLibrary);
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
  applyWorkLibrary(workLibrary) {
    const sortedLibrary = this.sortWorkLibrary(workLibrary);
    this.setData({
      workLibrary: sortedLibrary,
      displayWorks: sortedLibrary,
      totalCloneCount: sortedLibrary.reduce((sum, item) => sum + (item.clones || 0), 0)
    });
    this.persistWorkLibrary(sortedLibrary);
  },
  setDataAsync(payload) {
    return new Promise((resolve) => {
      this.setData(payload, resolve);
    });
  },
  updateWorkLibrary(id, updater) {
    const workLibrary = this.data.workLibrary.map((work) => (work.id === id ? updater(work) : work));
    this.applyWorkLibrary(workLibrary);
  },
  prependWork(work) {
    const next = [work, ...this.data.workLibrary];
    this.applyWorkLibrary(next);
  },
  handleFabTap() {
    if (this.data.isConverting) {
      wx.showToast({ title: "当前有任务正在转换", icon: "none" });
      return;
    }
    this.resetUploadModal();
    this.setData({
      showUploadModal: true
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
      selectedStyleMode: "cartoon",
      selectedMaxEdge: "52",
      customMaxEdge: "",
      costHintText: "转换一次花费1拼豆币，当前拼豆币：12",
      styleHintText: "适合拼豆的Q版人物、萌宠等Q版动漫像素风格"
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

    const labelMap = {
      origin: "原图",
      ai: "AI图",
      grid: "图纸"
    };

    const imagePath = work.previewImages && work.previewImages[viewType] ? work.previewImages[viewType] : "";
    if (!imagePath && work.isGenerating && viewType !== "origin") {
      wx.showToast({ title: "图纸生成中，请稍候", icon: "none" });
      return;
    }

    const toneMap = work.previewTones || {};
    this.setData({
      showWorkPreviewModal: true,
      previewWorkTitle: work.title,
      previewLabel: labelMap[viewType] || "预览",
      previewTone: toneMap[viewType] || "origin-a",
      previewImagePath: imagePath
    });
  },
  handleCloseWorkPreview() {
    this.setData({
      showWorkPreviewModal: false,
      previewImagePath: ""
    });
  },
  handleOpenColorSheet(event) {
    const workId = event.currentTarget.dataset.id;
    const work = this.data.workLibrary.find((item) => item.id === workId);
    if (!work || work.isGenerating) {
      wx.showToast({ title: "请等待图纸生成完成", icon: "none" });
      return;
    }
    if (work.isFailed || !(work.previewImages && work.previewImages.grid)) {
      wx.showToast({ title: "该作品暂不可编辑", icon: "none" });
      return;
    }
    const hasPackedEditorData = Boolean(work.editorData && work.editorData.indexGridPacked);
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
      success: (res) => {
        if (!res.confirm) return;
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
    const hint = mode === "fine"
      ? "细节更丰富，适合服装、场景较复杂的精致像素风"
      : "适合拼豆的Q版人物、萌宠等Q版动漫像素风格";
    this.setData({ selectedStyleMode: mode, styleHintText: hint });
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

    await this.setDataAsync({ processCanvasSize: gridSize });
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
  buildCountMapFromHexGrid(hexGrid) {
    const counter = Object.create(null);
    for (let i = 0; i < hexGrid.length; i += 1) {
      const hex = String(hexGrid[i] || "#FFFFFF").toUpperCase();
      counter[hex] = (counter[hex] || 0) + 1;
    }
    return counter;
  },
  async renderPatternImage(hexGrid, width, height, withGridLines) {
    const cellSize = withGridLines ? 12 : 10;
    const canvasWidth = width * cellSize;
    const canvasHeight = height * cellSize;
    const canvasSize = Math.max(canvasWidth, canvasHeight);
    await this.setDataAsync({ renderCanvasSize: canvasSize });

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
  async generatePatternFromUpload(imagePath) {
    const imageInfo = await this.getImageInfo(imagePath);
    const maxEdge = this.resolveMaxEdgeFromSelection();
    const preferWholeImportLayout = true;

    const processingEdge = clamp(maxEdge * 2, maxEdge, 400);
    const sampledResult = await this.sampleImageToGrid(imagePath, imageInfo, processingEdge, processingEdge);
    const sampledImageData = sampledResult && sampledResult.imageData ? sampledResult.imageData : sampledResult;
    const quantized = quantizeToPalette(sampledImageData.data);
    const backgroundProfile = this.buildBackgroundHexProfileFromHexGrid(
      quantized.hexGrid,
      processingEdge,
      processingEdge
    );
    const backgroundSet = backgroundProfile.set;
    const backgroundHex = backgroundProfile.primaryHex || "#FFFFFF";
    const boundsPadding = Math.max(1, Math.floor(processingEdge * 0.015));
    const adaptiveBounds = this.padContentBounds(
      this.computePrimaryContentBoundsFromHexGrid(
        quantized.hexGrid,
        processingEdge,
        processingEdge,
        backgroundSet
      ) || this.computeContentBoundsFromHexGrid(
        quantized.hexGrid,
        processingEdge,
        processingEdge,
        backgroundSet
      ),
      processingEdge,
      processingEdge,
      boundsPadding
    );
    const sourceRect = sampledResult && sampledResult.sourceRect
      ? sampledResult.sourceRect
      : {
        drawX: 0,
        drawY: 0,
        drawWidth: processingEdge,
        drawHeight: processingEdge
      };
    const wholeImportBounds = {
      minX: Math.max(0, Math.floor(sourceRect.drawX || 0)),
      minY: Math.max(0, Math.floor(sourceRect.drawY || 0)),
      maxX: Math.min(processingEdge - 1, Math.floor((sourceRect.drawX || 0) + Math.max(1, sourceRect.drawWidth || processingEdge) - 1)),
      maxY: Math.min(processingEdge - 1, Math.floor((sourceRect.drawY || 0) + Math.max(1, sourceRect.drawHeight || processingEdge) - 1)),
      width: Math.max(1, Math.floor(sourceRect.drawWidth || processingEdge)),
      height: Math.max(1, Math.floor(sourceRect.drawHeight || processingEdge))
    };
    const initialBounds = preferWholeImportLayout ? wholeImportBounds : adaptiveBounds;
    const trimmedGrid = initialBounds
      ? this.extractHexGridRect(quantized.hexGrid, processingEdge, initialBounds)
      : quantized.hexGrid.slice(0, processingEdge * processingEdge);
    const trimmedWidth = initialBounds ? initialBounds.width : processingEdge;
    const trimmedHeight = initialBounds ? initialBounds.height : processingEdge;
    const ratio = trimmedWidth / Math.max(1, trimmedHeight);
    const targetWidth = ratio >= 1
      ? maxEdge
      : Math.max(1, Math.round(maxEdge * ratio));
    const targetHeight = ratio >= 1
      ? Math.max(1, Math.round(maxEdge / Math.max(1e-6, ratio)))
      : maxEdge;
    const scaledRectGrid = this.scaleHexGridSmart(
      trimmedGrid,
      trimmedWidth,
      trimmedHeight,
      targetWidth,
      targetHeight,
      backgroundHex
    );
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

    const indexGrid = squareHexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = PALETTE_INDEX_BY_HEX[key];
      return Number.isFinite(mapped) ? mapped : safeBackgroundIndex;
    });
    const usedColorIndexes = [...new Set(indexGrid)].sort((a, b) => a - b);
    const scaledCounts = this.buildCountMapFromHexGrid(scaledRectGrid);
    const pixelImagePath = await this.renderPatternImage(scaledRectGrid, targetWidth, targetHeight, false);
    const gridImagePath = await this.renderPatternImage(scaledRectGrid, targetWidth, targetHeight, true);

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
        indexGridPacked: packIndexGrid(indexGrid, EDITOR_MAX_INDEX),
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
  buildPendingWorkRecord(workName) {
    const workId = `w-${Date.now()}`;
    return {
      id: workId,
      title: workName || "AI生成拼豆作品",
      date: "刚刚",
      createdAt: Date.now(),
      size: "转换中",
      style: "精致像素",
      status: "转换中",
      isGenerating: true,
      isFailed: false,
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
    const pendingWork = this.buildPendingWorkRecord(workName);
    this.prependWork(pendingWork);

    await this.setDataAsync({
      showUploadModal: false,
      isConverting: true
    });

    wx.showLoading({
      title: "AI图纸生成中",
      mask: true
    });

    try {
      const result = await this.generatePatternFromUpload(
        this.data.uploadImagePath
      );

      this.updateWorkLibrary(pendingWork.id, (work) => ({
        ...work,
        status: "已完成",
        isGenerating: false,
        isFailed: false,
        date: "刚刚",
        createdAt: work.createdAt || Date.now(),
        size: `${result.displayWidth}x${result.displayHeight}`,
        style: "精致像素",
        previewImages: {
          origin: work.previewImages.origin,
          ai: result.pixelImagePath,
          grid: result.gridImagePath
        },
        beadEstimate: result.estimate,
        editorData: result.editorData
      }));

      wx.showToast({
        title: "图纸生成成功",
        icon: "success"
      });
    } catch (error) {
      console.error("AI convert failed", error);
      this.updateWorkLibrary(pendingWork.id, (work) => ({
        ...work,
        status: "转换失败",
        isGenerating: false,
        isFailed: true,
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
