const LOCAL_API_BASE_URL = "http://127.0.0.1:3000";
const CLOUD_API_BASE_URL = "";
const DOUBAO_SEEDREAM_DIRECT_URL = "";
const DOUBAO_SEEDREAM_DIRECT_MODEL = "";

function resolvePlatform() {
  try {
    if (typeof wx.getDeviceInfo === "function") {
      const info = wx.getDeviceInfo();
      return String(info && info.platform || "").toLowerCase();
    }
  } catch (error) {
    // Ignore and continue to legacy API.
  }
  try {
    const info = typeof wx.getSystemInfoSync === "function" ? wx.getSystemInfoSync() : null;
    return String(info && info.platform || "").toLowerCase();
  } catch (error) {
    return "";
  }
}

function resolvePreferredApiBase() {
  const cloudBase = String(CLOUD_API_BASE_URL || "").trim().replace(/\/+$/, "");
  try {
    const platform = resolvePlatform();
    if (platform === "devtools" && LOCAL_API_BASE_URL) {
      return LOCAL_API_BASE_URL;
    }
    return cloudBase;
  } catch (error) {
    // Ignore and fall back to the configured cloud address.
  }
  return cloudBase;
}

App({
  globalData: {
    brandName: "豆像工坊",
    themeColor: "#ff7a00",
    localApiBaseUrl: LOCAL_API_BASE_URL,
    localLanApiBaseUrl: "",
    remoteApiBaseUrl: CLOUD_API_BASE_URL,
    pdfExportBaseUrl: CLOUD_API_BASE_URL,
    qVersionApiBaseUrl: CLOUD_API_BASE_URL,
    qVersionApiPath: "/api/q-cartoonize",
    qVersionApiToken: "",
    qVersionApiRequired: false,
    qVersionAllowLocalFallback: false,
    qVersionDirectEnabled: false,
    qVersionDirectApiUrl: DOUBAO_SEEDREAM_DIRECT_URL,
    qVersionDirectModel: DOUBAO_SEEDREAM_DIRECT_MODEL,
    qVersionDirectApiKey: "",
    openUploadModalOnCreateTab: false,
    createWorkLibraryCache: []
  },
  onLaunch() {
    const preferredBase = resolvePreferredApiBase();
    this.globalData.pdfExportBaseUrl = preferredBase;
    this.globalData.qVersionApiBaseUrl = preferredBase;
    this.globalData.remoteApiBaseUrl = preferredBase;
    this.globalData.qVersionApiRequired = Boolean(preferredBase);
  }
});
