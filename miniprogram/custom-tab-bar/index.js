Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/home/index" },
      { pagePath: "/pages/my/index" },
      { pagePath: "/pages/profile/index" }
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
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isFinite(index)) return;
      const item = this.data.list[index];
      if (!item) return;
      const currentRoute = this.getCurrentRoute();
      if (item.pagePath === currentRoute) return;
      this.setData({ selected: index });
      wx.switchTab({ url: item.pagePath });
    }
  }
});
