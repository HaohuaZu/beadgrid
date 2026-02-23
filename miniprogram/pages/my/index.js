const {
  FINE_PALETTE,
  resolveGridSize,
  quantizeToPalette,
  formatGridDate,
  buildBeadEstimate
} = require("../../utils/pixel-converter");
const { packIndexGrid } = require("../../utils/grid-pack");

const STORAGE_KEY = "bead_work_library_v1";
const BACKUP_STORAGE_KEY = "bead_work_library_backup_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";
const STORAGE_SEEDED_KEY = "bead_work_library_seeded_v1";
const MAX_STORED_WORKS = 20;
const MAX_EDITABLE_WORKS = 12;
const MAX_EDITOR_CELLS = 10000;
const DEFAULT_EDITOR_BG = "#FFFFFF";
const EDITOR_DATA_SCHEMA_VERSION = 3;
const PALETTE_INDEX_BY_HEX = FINE_PALETTE.reduce((acc, item, index) => {
  if (item && item.hex) {
    acc[item.hex.toUpperCase()] = index;
  }
  return acc;
}, Object.create(null));

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
    selectedSizeMode: "auto",
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
    if (width <= 0 || height <= 0 || width !== height) return 0;
    return width;
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
        return idx >= FINE_PALETTE.length ? 0 : idx;
      });
      indexGridPacked = packIndexGrid(normalized, FINE_PALETTE.length - 1);
    }
    if (!indexGridPacked || indexGridPacked.length < cellCount * 2) return null;

    const usedColorIndexes = Array.isArray(editorData.usedColorIndexes)
      ? [...new Set(editorData.usedColorIndexes
        .map((item) => Number(item))
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < FINE_PALETTE.length))]
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
      userEdited
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
      selectedSizeMode: "auto",
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
  ensureUniqueWorkName(baseName) {
    const existing = new Set(this.data.workLibrary.map((item) => (item.title || "").trim()).filter(Boolean));
    if (!existing.has(baseName)) return baseName;
    let seq = 2;
    while (existing.has(`${baseName}-${seq}`)) {
      seq += 1;
    }
    return `${baseName}-${seq}`;
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
    wx.navigateTo({
      url: `/pages/editor/index?workId=${workId || ""}&name=${name}`
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
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.selectedSizeMode) return;
    this.setData({ selectedSizeMode: mode });
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
  async sampleImageToGrid(imagePath, imageInfo, gridSize) {
    const sourceWidth = imageInfo.width || gridSize;
    const sourceHeight = imageInfo.height || gridSize;
    const srcRatio = sourceWidth / sourceHeight;
    const targetRatio = 1;

    let drawWidth = gridSize;
    let drawHeight = gridSize;
    let drawX = 0;
    let drawY = 0;

    // CanvasContext.drawImage 在小程序里以 5 参数最稳定，
    // 这里通过“放大 + 偏移”实现中心裁切，避免部分机型/版本出现截取错位。
    if (srcRatio > targetRatio) {
      drawHeight = gridSize;
      drawWidth = Math.round(gridSize * srcRatio);
      drawX = Math.floor((gridSize - drawWidth) / 2);
      drawY = 0;
    } else if (srcRatio < targetRatio) {
      drawWidth = gridSize;
      drawHeight = Math.round(gridSize / srcRatio);
      drawX = 0;
      drawY = Math.floor((gridSize - drawHeight) / 2);
    }

    await this.setDataAsync({ processCanvasSize: gridSize });
    await this.drawCanvasAsync("processCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, gridSize, gridSize);
      ctx.drawImage(imagePath, drawX, drawY, drawWidth, drawHeight);
    });

    return this.canvasGetImageDataAsync("processCanvas", gridSize, gridSize);
  },
  async renderPatternImage(hexGrid, gridSize, withGridLines) {
    const cellSize = withGridLines ? 12 : 10;
    const canvasSize = gridSize * cellSize;
    await this.setDataAsync({ renderCanvasSize: canvasSize });

    await this.drawCanvasAsync("renderCanvas", (ctx) => {
      ctx.setFillStyle("#FFFFFF");
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
          const index = y * gridSize + x;
          const color = hexGrid[index] || "#FFFFFF";
          ctx.setFillStyle(color);
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }

      if (withGridLines) {
        for (let i = 0; i <= gridSize; i += 1) {
          const pos = i * cellSize;
          const major = i % 5 === 0;
          ctx.beginPath();
          ctx.setLineWidth(major ? 1.4 : 0.7);
          ctx.setStrokeStyle(major ? "rgba(15, 23, 42, 0.48)" : "rgba(15, 23, 42, 0.2)");
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, canvasSize);
          ctx.stroke();

          ctx.beginPath();
          ctx.setLineWidth(major ? 1.4 : 0.7);
          ctx.setStrokeStyle(major ? "rgba(15, 23, 42, 0.48)" : "rgba(15, 23, 42, 0.2)");
          ctx.moveTo(0, pos);
          ctx.lineTo(canvasSize, pos);
          ctx.stroke();
        }
      }
    });

    return this.canvasToTempFileAsync("renderCanvas", canvasSize, canvasSize);
  },
  async generatePatternFromUpload(imagePath, sizeMode) {
    const imageInfo = await this.getImageInfo(imagePath);
    const gridSize = resolveGridSize(sizeMode, imageInfo.width, imageInfo.height);

    const sampled = await this.sampleImageToGrid(imagePath, imageInfo, gridSize);
    const quantized = quantizeToPalette(sampled.data);
    const indexGrid = quantized.hexGrid.map((hex) => {
      const key = String(hex || "").toUpperCase();
      const mapped = PALETTE_INDEX_BY_HEX[key];
      return Number.isFinite(mapped) ? mapped : 0;
    });
    const usedColorIndexes = [...new Set(indexGrid)].sort((a, b) => a - b);
    const pixelImagePath = await this.renderPatternImage(quantized.hexGrid, gridSize, false);
    const gridImagePath = await this.renderPatternImage(quantized.hexGrid, gridSize, true);

    return {
      gridSize,
      pixelImagePath,
      gridImagePath,
      estimate: buildBeadEstimate(gridSize, quantized.counts),
      editorData: {
        version: EDITOR_DATA_SCHEMA_VERSION,
        gridSize,
        indexGridPacked: packIndexGrid(indexGrid, FINE_PALETTE.length - 1),
        usedColorIndexes,
        backgroundHex: DEFAULT_EDITOR_BG,
        userEdited: false
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
        this.data.uploadImagePath,
        this.data.selectedSizeMode
      );

      this.updateWorkLibrary(pendingWork.id, (work) => ({
        ...work,
        status: "已完成",
        isGenerating: false,
        isFailed: false,
        date: "刚刚",
        createdAt: work.createdAt || Date.now(),
        size: `${result.gridSize}x${result.gridSize}`,
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
  noop() {}
});
