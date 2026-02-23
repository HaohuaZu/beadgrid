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

const TAG_OPTIONS = {
  recommend: ["全部", "新手友好", "高复用", "节日热榜"],
  scene: ["全部", "第一次拼豆", "送礼物", "情侣纪念", "亲子手工", "摆摊爆款", "节日装饰"],
  people: ["全部", "拼豆小白", "情侣", "亲子家庭", "手工爱好者", "摆摊卖家"],
  difficulty: ["全部", "入门", "进阶", "高阶"]
};

function getHotScore(item) {
  return item.views * 0.2 + item.likes * 2 + item.favorites * 3 + item.clones * 2;
}

Page({
  data: {
    mainNavs: [
      { id: "recommend", label: "推荐" },
      { id: "scene", label: "场景" },
      { id: "people", label: "人群" },
      { id: "difficulty", label: "难度" }
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
    papers: PAPER_LIBRARY,
    displayPapers: []
  },
  onLoad() {
    this.applyFilters();
  },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({ selected: 0 });
    }
  },
  matchMainTag(item) {
    const { activeMainNav, activeTag } = this.data;
    if (activeTag === "全部") return true;

    if (activeMainNav === "scene") {
      return item.scene === activeTag;
    }

    if (activeMainNav === "people") {
      return Array.isArray(item.audience) && item.audience.includes(activeTag);
    }

    if (activeMainNav === "difficulty") {
      return item.difficulty === activeTag;
    }

    if (activeTag === "新手友好") return item.difficulty === "入门";
    if (activeTag === "高复用") return item.clones >= 40;
    if (activeTag === "节日热榜") return item.theme === "节日" || item.scene === "节日装饰";
    return true;
  },
  sortItems(items) {
    const { activeSortNav } = this.data;
    const list = [...items];

    if (activeSortNav === "all") {
      return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    if (activeSortNav === "featured") {
      return list
        .filter((item) => !!item.official)
        .sort((a, b) => getHotScore(b) - getHotScore(a));
    }

    return list.sort((a, b) => getHotScore(b) - getHotScore(a));
  },
  applyFilters() {
    const keyword = (this.data.searchKeyword || "").trim().toLowerCase();
    const filtered = this.data.papers.filter((item) => {
      const matchesKeyword = !keyword
        || item.title.toLowerCase().includes(keyword)
        || item.author.toLowerCase().includes(keyword)
        || item.theme.toLowerCase().includes(keyword)
        || item.scene.toLowerCase().includes(keyword);
      return matchesKeyword && this.matchMainTag(item);
    });
    this.setData({
      displayPapers: this.sortItems(filtered)
    });
  },
  handleMainNavTap(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.data.activeMainNav) return;
    this.setData({
      activeMainNav: id,
      activeTag: "全部",
      activeTagOptions: TAG_OPTIONS[id] || ["全部"]
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
      title: "可按场景、人群、难度筛选",
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
    const papers = this.data.papers.map((item) => (item.id === id ? updater(item) : item));
    this.setData({ papers }, () => this.applyFilters());
  },
  handlePreviewPaper(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    this.updatePaperList(id, (item) => ({ ...item, views: item.views + 1 }));
    wx.showToast({
      title: "已打开图纸预览",
      icon: "none"
    });
  },
  handleExportPaper(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    this.updatePaperList(id, (item) => ({ ...item, clones: item.clones + 1 }));
    wx.showToast({
      title: "已导出图纸",
      icon: "none"
    });
  },
  handleEditPaper(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const paper = this.data.papers.find((item) => item.id === id);
    const name = paper ? encodeURIComponent(paper.title) : "";
    wx.navigateTo({
      url: `/pages/editor/index?workId=${id}&name=${name}`
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
