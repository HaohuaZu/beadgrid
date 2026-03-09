const LOCAL_API_BASE_URL = "http://127.0.0.1:3000";
const LOCAL_LAN_API_BASE_URL = "http://192.168.0.140:3000";
const REMOTE_API_BASE_URL = "http://175.178.0.34";
const DOUBAO_SEEDREAM_DIRECT_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const DOUBAO_SEEDREAM_DIRECT_MODEL = "doubao-seedream-4-5-251128";
const DOUBAO_SEEDREAM_DIRECT_API_KEY = "a53c67f5-053c-4307-82b9-e5d9d5ceee3d";

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
  try {
    const platform = resolvePlatform();
    if (platform === "devtools") {
      return LOCAL_API_BASE_URL;
    }
    return LOCAL_LAN_API_BASE_URL || REMOTE_API_BASE_URL;
  } catch (error) {
    // Ignore and fall back to the remotely reachable address.
  }
  return REMOTE_API_BASE_URL;
}

App({
  globalData: {
    brandName: "豆像工坊",
    themeColor: "#ff7a00",
    localApiBaseUrl: LOCAL_API_BASE_URL,
    localLanApiBaseUrl: LOCAL_LAN_API_BASE_URL,
    remoteApiBaseUrl: REMOTE_API_BASE_URL,
    pdfExportBaseUrl: REMOTE_API_BASE_URL,
    qVersionApiBaseUrl: REMOTE_API_BASE_URL,
    qVersionApiPath: "/api/q-cartoonize",
    qVersionApiToken: "",
    qVersionApiRequired: false,
    qVersionAllowLocalFallback: true,
    qVersionDirectEnabled: true,
    qVersionDirectApiUrl: DOUBAO_SEEDREAM_DIRECT_URL,
    qVersionDirectModel: DOUBAO_SEEDREAM_DIRECT_MODEL,
    qVersionDirectApiKey: DOUBAO_SEEDREAM_DIRECT_API_KEY,
    openUploadModalOnCreateTab: false,
    createWorkLibraryCache: []
  },
  onLaunch() {
    const preferredBase = resolvePreferredApiBase();
    this.globalData.pdfExportBaseUrl = preferredBase;
    this.globalData.qVersionApiBaseUrl = preferredBase;
    this.globalData.qVersionApiRequired = preferredBase === LOCAL_API_BASE_URL || preferredBase === LOCAL_LAN_API_BASE_URL;
  }
});
