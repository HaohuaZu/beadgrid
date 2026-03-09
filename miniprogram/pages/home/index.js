const PAPER_LIBRARY = [
  {
    id: "p1",
    title: "奶油猫头像",
    author: "豆友_A",
    avatarText: "A",
    size: "32x32",
    colorCount: 8,
    difficulty: "入门",
    scene: "第一次拼豆",
    audience: ["拼豆小白", "亲子家庭", "手工爱好者"],
    theme: "动物",
    hot: true,
    views: 328,
    clones: 67,
    likes: 103,
    favorites: 211,
    official: true,
    createdAt: 20260222,
    tone: "orange"
  },
  {
    id: "p2",
    title: "春节福马",
    author: "豆友_B",
    avatarText: "B",
    size: "48x48",
    colorCount: 14,
    difficulty: "进阶",
    scene: "送礼物",
    audience: ["情侣", "手工爱好者"],
    theme: "节日",
    hot: true,
    views: 276,
    clones: 54,
    likes: 79,
    favorites: 164,
    official: false,
    createdAt: 20260220,
    tone: "gold"
  },
  {
    id: "p3",
    title: "情侣像素头像",
    author: "豆友_C",
    avatarText: "C",
    size: "40x40",
    colorCount: 12,
    difficulty: "进阶",
    scene: "情侣纪念",
    audience: ["情侣"],
    theme: "情侣",
    hot: false,
    views: 198,
    clones: 41,
    likes: 50,
    favorites: 129,
    official: false,
    createdAt: 20260218,
    tone: "pink"
  },
  {
    id: "p4",
    title: "招财猫挂件",
    author: "豆友_D",
    avatarText: "D",
    size: "28x28",
    colorCount: 7,
    difficulty: "入门",
    scene: "摆摊爆款",
    audience: ["摆摊卖家", "手工爱好者"],
    theme: "卡通",
    hot: true,
    views: 351,
    clones: 73,
    likes: 45,
    favorites: 50,
    official: false,
    createdAt: 20260221,
    tone: "red"
  },
  {
    id: "p5",
    title: "新年文字牌",
    author: "豆友_E",
    avatarText: "E",
    size: "36x24",
    colorCount: 6,
    difficulty: "入门",
    scene: "亲子手工",
    audience: ["拼豆小白", "亲子家庭"],
    theme: "文字",
    hot: false,
    views: 143,
    clones: 19,
    likes: 38,
    favorites: 66,
    official: true,
    createdAt: 20260215,
    tone: "purple"
  },
  {
    id: "p6",
    title: "柴犬摆件",
    author: "豆友_F",
    avatarText: "F",
    size: "64x64",
    colorCount: 22,
    difficulty: "高阶",
    scene: "节日装饰",
    audience: ["手工爱好者", "摆摊卖家"],
    theme: "动物",
    hot: false,
    views: 124,
    clones: 17,
    likes: 21,
    favorites: 47,
    official: false,
    createdAt: 20260212,
    tone: "orange"
  }
];
const PUBLISHED_PAPER_STORAGE_KEY = "bead_published_paper_library_v1";
const PAPER_INTERACTION_STORAGE_KEY = "bead_square_interactions_v1";

const TAG_OPTIONS = {
  recommend: ["全部", "新手友好", "高复用", "节日热榜"],
  scene: ["全部", "第一次拼豆", "送礼物", "情侣纪念", "亲子手工", "摆摊爆款", "节日装饰"],
  people: ["全部", "拼豆小白", "情侣", "亲子家庭", "手工爱好者", "摆摊卖家"],
  difficulty: ["全部", "入门", "进阶", "高阶"]
};

function getHotScore(item) {
  let publishBoost = 0;
  const createdAt = Number(item && item.createdAt);
  if (item && item.isPublishedUserWork && Number.isFinite(createdAt) && createdAt > 1e12) {
    const ageHours = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60));
    publishBoost = Math.max(0, 120 - ageHours * 2);
  }
  return item.views * 0.2 + item.likes * 2 + item.favorites * 3 + item.clones * 2 + publishBoost;
}

function parseGridEdge(sizeText) {
  const matched = String(sizeText || "").match(/(\d+)\s*x\s*(\d+)/i);
  if (!matched) return 0;
  const width = Number(matched[1]) || 0;
  const height = Number(matched[2]) || 0;
  return Math.max(width, height);
}

function resolveDifficultyByEdge(edge) {
  if (edge <= 36) return "入门";
  if (edge <= 72) return "进阶";
  return "高阶";
}

function formatPaperDateText(value) {
  const raw = Number(value) || 0;
  if (!raw) return "";
  if (raw > 1e12) {
    const date = new Date(raw);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }
  const compact = String(Math.floor(raw));
  if (/^\d{8}$/.test(compact)) {
    const month = Number(compact.slice(4, 6)) || 0;
    const day = Number(compact.slice(6, 8)) || 0;
    return `${month}月${day}日`;
  }
  return "";
}

function formatPaperSizeText(sizeText) {
  return String(sizeText || "").replace(/x/ig, "×");
}

function sortByCreatedDesc(list) {
  return [...list].sort((a, b) => (Number(b && b.createdAt) || 0) - (Number(a && a.createdAt) || 0));
}

function normalizePublishedPaper(item, index = 0) {
  const source = item && typeof item === "object" ? item : {};
  const edge = parseGridEdge(source.size);
  const now = Date.now() - index * 1000;
  const title = String(source.title || "我的作品").trim() || "我的作品";
  const theme = String(source.theme || title.slice(0, 4) || "自定义");
  const audience = Array.isArray(source.audience) && source.audience.length
    ? source.audience
    : ["手工爱好者"];
  return {
    id: source.id || `pub-${now}-${index}`,
    sourceWorkId: source.sourceWorkId || source.workId || "",
    workId: source.workId || source.sourceWorkId || "",
    title,
    author: source.author || "我的发布",
    avatarText: source.avatarText || "我",
    avatarImage: typeof source.avatarImage === "string" ? source.avatarImage : "",
    brand: String(source.brand || "MARD"),
    size: source.size || (edge ? `${edge}x${edge}` : "36x36"),
    colorCount: Number(source.colorCount) || 0,
    difficulty: source.difficulty || resolveDifficultyByEdge(edge || 36),
    scene: source.scene || "自由创作",
    audience,
    theme,
    hot: Boolean(source.hot),
    views: Number(source.views) || 0,
    clones: Number(source.clones) || 0,
    likes: Number(source.likes) || 0,
    favorites: Number(source.favorites) || 0,
    official: Boolean(source.official),
    createdAt: Number(source.createdAt) || now,
    publishedAt: Number(source.publishedAt) || 0,
    tone: source.tone || "pink",
    previewImage: typeof source.previewImage === "string" ? source.previewImage : "",
    beadEstimate: source && source.beadEstimate
      ? {
        total: Number(source.beadEstimate.total) || 0,
        colorUsed: Number(source.beadEstimate.colorUsed) || 0
      }
      : null,
    editorData: source && source.editorData && typeof source.editorData === "object"
      ? {
        ...source.editorData
      }
      : null,
    isMine: source.isMine !== false,
    isPublishedUserWork: true,
    tags: Array.isArray(source.tags) ? source.tags.filter(Boolean) : [],
    description: typeof source.description === "string" ? source.description : "",
    allowClone: source.allowClone !== false,
    allowExport: source.allowExport !== false,
    qrLinkType: source.qrLinkType === "none" ? "none" : "profile",
    publishMeta: source.publishMeta && typeof source.publishMeta === "object"
      ? {
        ...source.publishMeta
      }
      : null
  };
}

Page({
  data: {
    mainNavs: [
      { id: "recommend", label: "热门" },
      { id: "scene", label: "精选" },
      { id: "people", label: "全部" },
      { id: "difficulty", label: "我的" }
    ],
    sortNavs: [
      { id: "hot", label: "热门" },
      { id: "featured", label: "精选" },
      { id: "all", label: "全部" }
    ],
    activeMainNav: "recommend",
    activeSortNav: "hot",
    activeTag: "全部",
    activeTagOptions: TAG_OPTIONS.recommend,
    searchKeyword: "",
    searchDraft: "",
    showSearchPanel: false,
    showPaperPreviewModal: false,
    previewPaperId: "",
    previewPaperTitle: "",
    previewPaperLabel: "",
    previewPaperImage: "",
    previewPaperTone: "pink",
    previewPaperIsPixel: false,
    previewPaperAuthor: "",
    previewPaperAvatarText: "",
    previewPaperAvatarImage: "",
    previewPaperBrand: "MARD",
    previewPaperSize: "",
    previewPaperDateText: "",
    previewPaperLikes: 0,
    previewPaperFavorites: 0,
    previewPaperLiked: false,
    previewPaperFavorited: false,
    previewPaperCanBead: false,
    previewPaperCanDownload: true,
    papers: PAPER_LIBRARY,
    displayPapers: []
  },
  onLoad() {
    this.loadPaperInteractions();
    this.loadPaperLibrary();
  },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({ selected: 0 });
    }
    this.loadPaperLibrary();
  },
  readPublishedPaperLibrary() {
    try {
      const stored = wx.getStorageSync(PUBLISHED_PAPER_STORAGE_KEY);
      if (!Array.isArray(stored)) return [];
      return stored.map((item, index) => normalizePublishedPaper(item, index));
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
  loadPaperInteractions() {
    this.paperInteractions = {
      likedIds: Object.create(null),
      favoritedIds: Object.create(null)
    };
    try {
      const stored = wx.getStorageSync(PAPER_INTERACTION_STORAGE_KEY);
      const likedIds = Array.isArray(stored && stored.likedIds) ? stored.likedIds : [];
      const favoritedIds = Array.isArray(stored && stored.favoritedIds) ? stored.favoritedIds : [];
      likedIds.forEach((id) => {
        if (id) this.paperInteractions.likedIds[String(id)] = true;
      });
      favoritedIds.forEach((id) => {
        if (id) this.paperInteractions.favoritedIds[String(id)] = true;
      });
    } catch (error) {
      console.warn("load paper interactions failed", error);
    }
  },
  persistPaperInteractions() {
    const likedIds = Object.keys(this.paperInteractions && this.paperInteractions.likedIds || {});
    const favoritedIds = Object.keys(this.paperInteractions && this.paperInteractions.favoritedIds || {});
    try {
      wx.setStorageSync(PAPER_INTERACTION_STORAGE_KEY, {
        likedIds,
        favoritedIds
      });
    } catch (error) {
      console.warn("persist paper interactions failed", error);
    }
  },
  isPaperLiked(id) {
    const key = String(id || "");
    return Boolean(key && this.paperInteractions && this.paperInteractions.likedIds && this.paperInteractions.likedIds[key]);
  },
  isPaperFavorited(id) {
    const key = String(id || "");
    return Boolean(key && this.paperInteractions && this.paperInteractions.favoritedIds && this.paperInteractions.favoritedIds[key]);
  },
  setPaperInteraction(type, id, active) {
    const key = String(id || "");
    if (!key || !this.paperInteractions || !this.paperInteractions[type]) return;
    if (active) {
      this.paperInteractions[type][key] = true;
    } else {
      delete this.paperInteractions[type][key];
    }
    this.persistPaperInteractions();
  },
  loadPaperLibrary() {
    const published = this.readPublishedPaperLibrary();
    const papers = [...published, ...PAPER_LIBRARY];
    this.setData({ papers }, () => this.applyFilters());
  },
  persistPublishedPapersFromList(papers) {
    const published = (Array.isArray(papers) ? papers : [])
      .filter((item) => item && item.isPublishedUserWork)
      .map((item, index) => normalizePublishedPaper(item, index));
    this.writePublishedPaperLibrary(published);
  },
  getPaperById(id) {
    const safeId = String(id || "");
    if (!safeId) return null;
    return this.data.papers.find((item) => item && item.id === safeId) || null;
  },
  buildPreviewPaperState(paper) {
    const source = paper && typeof paper === "object" ? paper : {};
    const paperId = String(source.id || "");
    return {
      previewPaperId: paperId,
      previewPaperTitle: source.title || "图纸预览",
      previewPaperLabel: source.isPublishedUserWork ? "创作者发布作品" : "图纸广场精选",
      previewPaperImage: source.previewImage || "",
      previewPaperTone: source.tone || "pink",
      previewPaperIsPixel: true,
      previewPaperAuthor: source.author || "拼豆作者",
      previewPaperAvatarText: source.avatarText || "豆",
      previewPaperAvatarImage: source.avatarImage || "",
      previewPaperBrand: source.brand || "MARD",
      previewPaperSize: formatPaperSizeText(source.size || ""),
      previewPaperDateText: formatPaperDateText(source.publishedAt || source.createdAt),
      previewPaperLikes: Number(source.likes) || 0,
      previewPaperFavorites: Number(source.favorites) || 0,
      previewPaperLiked: this.isPaperLiked(paperId),
      previewPaperFavorited: this.isPaperFavorited(paperId),
      previewPaperCanBead: Boolean(source.workId),
      previewPaperCanDownload: source.allowExport !== false
    };
  },
  isMinePaper(item) {
    return Boolean(item && item.isMine);
  },
  isUserUploadedPaper(item) {
    return Boolean(item && (item.isPublishedUserWork || !item.official));
  },
  resolvePrimaryActionForPaper(item) {
    if (this.isMinePaper(item)) {
      return {
        mode: "edit",
        label: "编辑",
        className: "edit"
      };
    }
    if (item && item.allowClone === false) {
      return {
        mode: "bead",
        label: "拼图",
        className: "bead"
      };
    }
    return {
      mode: "edit",
      label: "编辑",
      className: "edit"
    };
  },
  normalizeDisplayPaper(item) {
    const action = this.resolvePrimaryActionForPaper(item);
    return {
      ...item,
      primaryActionMode: action.mode,
      primaryActionLabel: action.label,
      primaryActionClassName: action.className
    };
  },
  matchMainTag(item) {
    return true;
  },
  applyFilters() {
    const keyword = (this.data.searchKeyword || "").trim().toLowerCase();
    const keywordFiltered = this.data.papers.filter((item) => {
      const tagsText = Array.isArray(item.tags) ? item.tags.join(" ").toLowerCase() : "";
      const descriptionText = String(item.description || "").toLowerCase();
      const matchesKeyword = !keyword
        || item.title.toLowerCase().includes(keyword)
        || item.author.toLowerCase().includes(keyword)
        || item.theme.toLowerCase().includes(keyword)
        || item.scene.toLowerCase().includes(keyword)
        || tagsText.includes(keyword)
        || descriptionText.includes(keyword);
      return matchesKeyword && this.matchMainTag(item);
    });
    let filtered = keywordFiltered;
    if (this.data.activeMainNav === "recommend") {
      filtered = [...keywordFiltered].sort((a, b) => getHotScore(b) - getHotScore(a));
    } else if (this.data.activeMainNav === "scene") {
      filtered = keywordFiltered
        .filter((item) => Boolean(item && item.official))
        .sort((a, b) => (Number(b && b.createdAt) || 0) - (Number(a && a.createdAt) || 0));
    } else if (this.data.activeMainNav === "people") {
      filtered = sortByCreatedDesc(keywordFiltered.filter((item) => this.isUserUploadedPaper(item)));
    } else if (this.data.activeMainNav === "difficulty") {
      filtered = sortByCreatedDesc(keywordFiltered.filter((item) => this.isMinePaper(item)));
    }
    this.setData({
      displayPapers: filtered.map((item) => this.normalizeDisplayPaper(item))
    });
  },
  handleMainNavTap(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.data.activeMainNav) return;
    this.setData({
      activeMainNav: id
    });
    this.applyFilters();
  },
  handleSortNavTap(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.data.activeSortNav) return;
    this.setData({ activeSortNav: id });
    this.applyFilters();
  },
  handleTagTap(event) {
    const tag = event.currentTarget.dataset.tag;
    if (!tag || tag === this.data.activeTag) return;
    this.setData({ activeTag: tag });
    this.applyFilters();
  },
  handleOpenFilterHint() {
    wx.showToast({
      title: "可通过搜索和顶部分类快速筛选",
      icon: "none"
    });
  },
  handleOpenSearchPanel() {
    this.setData({
      showSearchPanel: true,
      searchDraft: this.data.searchKeyword
    });
  },
  handleCloseSearchPanel() {
    this.setData({ showSearchPanel: false });
  },
  handleSearchDraftInput(event) {
    this.setData({ searchDraft: event.detail.value || "" });
  },
  handleSearchConfirm() {
    this.setData({
      searchKeyword: (this.data.searchDraft || "").trim(),
      showSearchPanel: false
    });
    this.applyFilters();
  },
  handleClearSearch() {
    this.setData({
      searchKeyword: "",
      searchDraft: ""
    });
    this.applyFilters();
  },
  updatePaperList(id, updater) {
    let updatedPaper = null;
    const papers = this.data.papers.map((item) => {
      if (!item || item.id !== id) return item;
      updatedPaper = updater(item);
      return updatedPaper;
    });
    this.persistPublishedPapersFromList(papers);
    this.setData({ papers }, () => this.applyFilters());
    return updatedPaper;
  },
  handlePreviewPaper(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const paper = this.data.displayPapers.find((item) => item && item.id === id)
      || this.data.papers.find((item) => item && item.id === id);
    if (!paper) return;
    const nextPaper = this.updatePaperList(id, (item) => ({ ...item, views: item.views + 1 })) || paper;
    this.setData({
      showPaperPreviewModal: true,
      ...this.buildPreviewPaperState(nextPaper)
    });
  },
  handleClosePaperPreview() {
    this.setData({
      showPaperPreviewModal: false,
      previewPaperId: "",
      previewPaperTitle: "",
      previewPaperLabel: "",
      previewPaperImage: "",
      previewPaperTone: "pink",
      previewPaperIsPixel: false,
      previewPaperAuthor: "",
      previewPaperAvatarText: "",
      previewPaperAvatarImage: "",
      previewPaperBrand: "MARD",
      previewPaperSize: "",
      previewPaperDateText: "",
      previewPaperLikes: 0,
      previewPaperFavorites: 0,
      previewPaperLiked: false,
      previewPaperFavorited: false,
      previewPaperCanBead: false,
      previewPaperCanDownload: true
    });
  },
  handlePreviewPaperImageError() {
    this.setData({
      previewPaperImage: ""
    });
  },
  exportPaperById(id) {
    if (!id) return;
    const paper = this.data.papers.find((item) => item.id === id);
    if (paper && paper.allowExport === false) {
      wx.showToast({
        title: "作者未开放导出",
        icon: "none"
      });
      return;
    }
    this.updatePaperList(id, (item) => ({ ...item, clones: item.clones + 1 }));
    wx.showToast({
      title: "已导出图纸",
      icon: "none"
    });
  },
  handleExportPaper(event) {
    const id = event.currentTarget.dataset.id;
    this.exportPaperById(id);
  },
  handleDownloadPreviewPaper() {
    if (!this.data.previewPaperCanDownload) {
      wx.showToast({
        title: "作者未开放导出",
        icon: "none"
      });
      return;
    }
    const id = this.data.previewPaperId;
    if (!id) return;
    this.exportPaperById(id);
  },
  togglePaperMetric(type) {
    const id = this.data.previewPaperId;
    if (!id) return;
    const paper = this.getPaperById(id);
    if (!paper) return;
    const liked = type === "likedIds";
    const current = liked ? this.isPaperLiked(id) : this.isPaperFavorited(id);
    const nextActive = !current;
    const field = liked ? "likes" : "favorites";
    const nextPaper = this.updatePaperList(id, (item) => ({
      ...item,
      [field]: Math.max(0, (Number(item[field]) || 0) + (nextActive ? 1 : -1))
    })) || paper;
    this.setPaperInteraction(type, id, nextActive);
    this.setData({
      ...this.buildPreviewPaperState(nextPaper)
    });
  },
  handleTogglePaperLike() {
    this.togglePaperMetric("likedIds");
  },
  handleTogglePaperFavorite() {
    this.togglePaperMetric("favoritedIds");
  },
  openPaperBeadMode(paper) {
    const source = paper && typeof paper === "object" ? paper : null;
    if (!source || !source.workId) {
      wx.showToast({
        title: "该图纸暂未开放拼豆模式",
        icon: "none"
      });
      return;
    }
    const name = encodeURIComponent(source.title || "");
    if (this.data.showPaperPreviewModal) {
      this.setData({ showPaperPreviewModal: false });
    }
    wx.navigateTo({
      url: `/pages/bead/index?workId=${source.workId}&name=${name}`
    });
  },
  handleOpenPaperBeadMode(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.id
      : this.data.previewPaperId;
    if (!id) return;
    const paper = this.getPaperById(id);
    this.openPaperBeadMode(paper);
  },
  handleEditPaper(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const paper = this.data.papers.find((item) => item.id === id);
    if (paper && paper.allowClone === false) {
      wx.showToast({
        title: "作者未开放复制",
        icon: "none"
      });
      return;
    }
    const workId = paper && paper.workId ? paper.workId : id;
    const name = paper ? encodeURIComponent(paper.title) : "";
    wx.navigateTo({
      url: `/pages/editor/index?workId=${workId}&name=${name}`
    });
  },
  handlePaperPrimaryAction(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.id
      : "";
    if (!id) return;
    const paper = this.getPaperById(id);
    if (!paper) return;
    const action = this.resolvePrimaryActionForPaper(paper);
    if (action.mode === "bead") {
      this.openPaperBeadMode(paper);
      return;
    }
    this.handleEditPaper({
      currentTarget: {
        dataset: {
          id
        }
      }
    });
  },
  handleGenerate() {
    const app = getApp && getApp();
    if (app && app.globalData) {
      app.globalData.openUploadModalOnCreateTab = true;
    }
    wx.switchTab({ url: "/pages/my/index" });
  },
  noop() {}
});
