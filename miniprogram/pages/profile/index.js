const STORAGE_KEY = "bead_work_library_v1";
const LEGACY_STORAGE_KEY = "bead_work_library_v0";
const ACCOUNT_ID_KEY = "bead_account_id_v0";

function createAccountId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let output = "";
  for (let i = 0; i < 14; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

Page({
  data: {
    accountId: "",
    nickname: "未设置昵称",
    coinBalance: 12,
    statWorks: 0,
    statLikes: 0,
    statSaves: 0,
    statClones: 0,
    quickEntries: [
      { key: "favorites", icon: "藏", title: "我的收藏" },
      { key: "records", icon: "记", title: "生成记录" }
    ],
    menuEntries: [
      { key: "coin", title: "豆币明细" },
      { key: "likes", title: "获赞与收藏" },
      { key: "downloads", title: "导出记录" },
      { key: "settings", title: "账号设置" }
    ]
  },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({ selected: 2 });
    }
    this.ensureAccountId();
    this.refreshSummary();
  },
  ensureAccountId() {
    let accountId = "";
    try {
      accountId = wx.getStorageSync(ACCOUNT_ID_KEY) || "";
      if (!accountId) {
        accountId = createAccountId();
        wx.setStorageSync(ACCOUNT_ID_KEY, accountId);
      }
    } catch (error) {
      console.warn("account id storage failed", error);
      if (!accountId) accountId = createAccountId();
    }
    this.setData({ accountId });
  },
  refreshSummary() {
    let workLibrary = [];
    try {
      let cached = wx.getStorageSync(STORAGE_KEY);
      if ((!Array.isArray(cached) || cached.length === 0) && LEGACY_STORAGE_KEY) {
        const legacy = wx.getStorageSync(LEGACY_STORAGE_KEY);
        if (Array.isArray(legacy) && legacy.length) {
          cached = legacy;
        }
      }
      workLibrary = Array.isArray(cached) ? cached : [];
    } catch (error) {
      console.warn("read work library failed", error);
      workLibrary = [];
    }

    const summary = workLibrary.reduce(
      (acc, item) => {
        if (item && item.status === "已完成") {
          acc.statWorks += 1;
        }
        acc.statLikes += Number(item && item.views) || 0;
        acc.statSaves += Number(item && item.saves) || 0;
        acc.statClones += Number(item && item.clones) || 0;
        return acc;
      },
      {
        statWorks: 0,
        statLikes: 0,
        statSaves: 0,
        statClones: 0
      }
    );

    this.setData(summary);
  },
  handleCopyAccount() {
    if (!this.data.accountId) return;
    wx.setClipboardData({
      data: this.data.accountId,
      success: () => {
        wx.showToast({ title: "已复制", icon: "none" });
      }
    });
  },
  handleQuickTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "favorites") {
      wx.showToast({ title: "收藏功能开发中", icon: "none" });
      return;
    }
    if (key === "records") {
      wx.switchTab({ url: "/pages/my/index" });
      return;
    }
    wx.showToast({ title: "功能开发中", icon: "none" });
  },
  handleMenuTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "likes") {
      wx.showToast({ title: "正在整理获赞与收藏数据", icon: "none" });
      return;
    }
    wx.showToast({ title: "功能开发中", icon: "none" });
  },
  handleContactService() {
    wx.showToast({ title: "可先通过微信消息联系我们", icon: "none" });
  }
});
