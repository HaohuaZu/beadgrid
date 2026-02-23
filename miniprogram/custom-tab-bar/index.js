Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/home/index", text: "图纸广场", key: "home" },
      { pagePath: "/pages/my/index", text: "创作", key: "create" },
      { pagePath: "/pages/profile/index", text: "我的", key: "profile" }
    ]
  },
  lifetimes: {
    attached() {
      this.updateSelected();
    }
  },
  pageLifetimes: {
    show() {
      this.updateSelected();
    }
  },
  methods: {
    getCurrentRoute() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      return current ? `/${current.route}` : "";
    },
    updateSelected() {
      const route = this.getCurrentRoute();
      if (!route) return;
      const selected = this.data.list.findIndex((item) => item.pagePath === route);
      if (selected === -1) return;
      this.setData({ selected });
    },
    switchTab(event) {
      const index = event.currentTarget.dataset.index;
      const item = this.data.list[index];
      if (!item) return;
      const currentRoute = this.getCurrentRoute();
      if (item.pagePath === currentRoute) return;
      this.setData({ selected: index });
      wx.switchTab({ url: item.pagePath });
    }
  }
});
