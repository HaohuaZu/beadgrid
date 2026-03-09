const imageInput = document.getElementById("imageInput");
const squareView = document.getElementById("squareView");
const createView = document.getElementById("createView");
const profileView = document.getElementById("profileView");
const createWorksList = document.getElementById("createWorksList");
const siteTabButtons = Array.from(document.querySelectorAll(".site-tab"));
const uploadTriggerButton = document.getElementById("uploadTrigger");
const uploadFilenameEl = document.getElementById("uploadFilename");
const workNameInput = document.getElementById("workName");
const gridSizeSelect = document.getElementById("gridSize");
const maxEdgeSizeRangeInput = document.getElementById("maxEdgeSizeRange");
const maxEdgeSizeInput = document.getElementById("maxEdgeSize");
const paletteSelect = document.getElementById("palette");
const samplingModeSelect = document.getElementById("samplingMode");
const styleModeSelect = document.getElementById("styleMode");
const styleModeHintEl = document.getElementById("styleModeHint");
const optimizeInput = document.getElementById("optimize");
const showCodesInput = document.getElementById("showCodes");
const generateNowButton = document.getElementById("generateNowButton");
const regenerateButton = document.getElementById("regenerateButton");
const clearWorkspaceButton = document.getElementById("clearWorkspaceButton");

const patternViewport = document.getElementById("patternViewport");
const patternCanvas = document.getElementById("patternCanvas");
const patternRulerTop = document.getElementById("patternRulerTop");
const patternRulerBottom = document.getElementById("patternRulerBottom");
const patternRulerLeft = document.getElementById("patternRulerLeft");
const patternRulerRight = document.getElementById("patternRulerRight");
const patternCoordBadge = document.getElementById("patternCoordBadge");
const previewEmptyState = document.getElementById("previewEmptyState");
const previewUploadTriggerButton = document.getElementById("previewUploadTrigger");
const previewReuploadTriggerButton = document.getElementById("previewReuploadTrigger");
const originPreviewCard = document.getElementById("originPreviewCard");
const originPreviewImage = document.getElementById("originPreviewImage");
const originPreviewPlaceholder = document.getElementById("originPreviewPlaceholder");
const originPreviewMeta = document.getElementById("originPreviewMeta");
const stylizedPreviewCard = document.getElementById("stylizedPreviewCard");
const stylizedPreviewImage = document.getElementById("stylizedPreviewImage");
const stylizedPreviewPlaceholder = document.getElementById("stylizedPreviewPlaceholder");
const stylizedPreviewLabel = document.getElementById("stylizedPreviewLabel");
const stylizedPreviewMeta = document.getElementById("stylizedPreviewMeta");
const gridPreviewCard = document.getElementById("gridPreviewCard");
const gridPreviewImage = document.getElementById("gridPreviewImage");
const gridPreviewPlaceholder = document.getElementById("gridPreviewPlaceholder");
const gridPreviewMeta = document.getElementById("gridPreviewMeta");

const zoomModal = document.getElementById("zoomModal");
const zoomModalBackdrop = document.getElementById("zoomModalBackdrop");
const zoomModalClose = document.getElementById("zoomModalClose");
const zoomModalReset = document.getElementById("zoomModalReset");
const zoomModalTitle = document.getElementById("zoomModalTitle");
const zoomModalViewport = document.getElementById("zoomModalViewport");
const zoomModalCanvas = document.getElementById("zoomModalCanvas");
const exportModal = document.getElementById("exportModal");
const exportModalBackdrop = document.getElementById("exportModalBackdrop");
const exportModalClose = document.getElementById("exportModalClose");
const exportPreviewCanvas = document.getElementById("exportPreviewCanvas");
const exportPlanSummaryEl = document.getElementById("exportPlanSummary");
const exportLargeHintEl = document.getElementById("exportLargeHint");
const exportFormatSelect = document.getElementById("exportFormat");
const exportModeSelect = document.getElementById("exportMode");
const exportModeHintEl = document.getElementById("exportModeHint");
const exportPresetHintEl = document.getElementById("exportPresetHint");
const exportConfirmButton = document.getElementById("exportConfirm");

const effectCompareStage = document.getElementById("effectCompareStage");
const effectDivider = document.querySelector(".effect-divider");
const effectOpenOriginalButton = document.getElementById("effectOpenOriginal");
const effectOpenResultButton = document.getElementById("effectOpenResult");
const openScenarioModalLink = document.getElementById("openScenarioModal");
const openEffectShowcaseModalLink = document.getElementById("openEffectShowcaseModal");
const scenarioModal = document.getElementById("scenarioModal");
const scenarioModalBackdrop = document.getElementById("scenarioModalBackdrop");
const scenarioModalClose = document.getElementById("scenarioModalClose");
const effectShowcaseModal = document.getElementById("effectShowcaseModal");
const effectShowcaseModalBackdrop = document.getElementById("effectShowcaseModalBackdrop");
const effectShowcaseModalClose = document.getElementById("effectShowcaseModalClose");
const effectModal = document.getElementById("effectModal");
const effectModalBackdrop = document.getElementById("effectModalBackdrop");
const effectModalClose = document.getElementById("effectModalClose");
const effectModalReset = document.getElementById("effectModalReset");
const effectModalTitle = document.getElementById("effectModalTitle");
const effectModalViewport = document.getElementById("effectModalViewport");
const effectModalImage = document.getElementById("effectModalImage");

const cropModal = document.getElementById("cropModal");
const cropModalBackdrop = document.getElementById("cropModalBackdrop");
const cropCanvas = document.getElementById("cropCanvas");
const cropResetButton = document.getElementById("cropReset");
const cropCancelButton = document.getElementById("cropCancel");
const cropConfirmButton = document.getElementById("cropConfirm");
const cropModeButtons = Array.from(document.querySelectorAll(".crop-mode-btn"));

const legendEl = document.getElementById("legend");
const legendToggleButton = document.getElementById("legendToggle");
const statusEl = document.getElementById("status");
const usageStatusEl = document.getElementById("usageStatus");
const exportPngButton = document.getElementById("exportPng");
const exportPdfButton = document.getElementById("exportPdf");
const wechatExportNoticeEl = document.getElementById("wechatExportNotice");
const wechatExportNoticeTextEl = document.getElementById("wechatExportNoticeText");
const copyPageLinkButton = document.getElementById("copyPageLinkButton");

const GRID_SIZES = [52, 104];
const DEFAULT_GRID_SIZE = GRID_SIZES[0];
const CODE_AUTO_ZOOM_THRESHOLD = 2;
const FIXED_MAPPING_STRATEGY = "direct";
const FIXED_PREPROCESS_MODE = "none";
const FIXED_ALPHA = "1.5";
const FIXED_BETA = "1.5";
const FIXED_MAX_COLORS = "12";
const PNG_EXPORT_TARGET_CELL_SIZE = 36;
const PNG_EXPORT_MIN_SIZE = 3200;
const PNG_EXPORT_MAX_SIZE = 5200;
const PNG_EXPORT_STANDARD_CELL_SIZE = 28;
const PNG_EXPORT_STANDARD_MIN_SIZE = 2200;
const PNG_EXPORT_STANDARD_MAX_SIZE = 3600;
const EXPORT_PREVIEW_STORAGE_KEY = "beadgrid-export-settings-v1";
const USER_AGENT = (navigator.userAgent || "").toLowerCase();
const IS_WECHAT_BROWSER = /micromessenger/.test(USER_AGENT);
const IS_IOS_DEVICE = /iphone|ipad|ipod/.test(USER_AGENT);

const CROP_MIN_SIZE = 48;
const CROP_HANDLE_SIZE = 10;
const CROP_MARGIN_RATIO = 0.08;
const STYLE_MODE_FINE = "fine";
const STYLE_MODE_CARTOON = "cartoon";
const WORK_LIBRARY_STORAGE_KEY = "bead_web_work_library_v1";
const ACCOUNT_ID_STORAGE_KEY = "bead_web_account_id_v1";

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

const state = {
  currentView: "square",
  grid: null,
  legend: null,
  gridSize: DEFAULT_GRID_SIZE,
  codeByHex: null,
  codeGrid: null,
  sourceFile: null,
  sourcePreviewUrl: "",
  stylizedPreviewUrl: "",
  gridPreviewUrl: "",
  generatedStylizedFile: null,
  stylizedSourceFingerprint: "",
  workName: "",
  patternLayout: null,
  legendExpanded: false,
  styleMode: STYLE_MODE_FINE,
  isGenerating: false,
  exportSettings: null,
  workLibrary: [],
  accountId: "",
  square: {
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
    papers: PAPER_LIBRARY.map((item) => ({ ...item })),
    displayPapers: []
  }
};

const cropState = {
  file: null,
  image: null,
  imageUrl: null,
  viewWidth: 0,
  viewHeight: 0,
  dpr: window.devicePixelRatio || 1,
  baseScale: 1,
  zoom: 1,
  minZoom: 0.5,
  maxZoom: 8,
  centerX: 0,
  centerY: 0,
  mode: "custom",
  ratio: null,
  ratioLocked: false,
  cropRect: { x: 0, y: 0, w: 100, h: 100 },
  interaction: null,
  suppressClick: false,
  activePointers: new Map(),
  pinch: null
};

state.exportSettings = loadExportSettings();

let generationId = 0;
let autoGenerateTimer = null;
let effectDragActive = false;
let effectDragPointerId = null;
let effectDragMoved = false;
let effectSuppressClickUntil = 0;
let effectViewScale = 1;
const effectViewPointers = new Map();
let effectViewPinchStartDistance = 0;
let effectViewPinchStartScale = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return clamp(number, min, max);
}

function getSafeGridSize(value) {
  const gridSize = Number.parseInt(value, 10);
  return GRID_SIZES.includes(gridSize) ? gridSize : DEFAULT_GRID_SIZE;
}

function getDefaultExportSettings() {
  return {
    format: "pdf",
    pdfMode: "a4",
    pngMode: "ultra"
  };
}

function loadExportSettings() {
  const defaults = getDefaultExportSettings();
  try {
    const raw = window.localStorage.getItem(EXPORT_PREVIEW_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      format: parsed && parsed.format === "png" ? "png" : defaults.format,
      pdfMode: parsed && parsed.pdfMode === "ultra" ? "ultra" : defaults.pdfMode,
      pngMode: parsed && parsed.pngMode === "standard" ? "standard" : defaults.pngMode
    };
  } catch (_error) {
    return defaults;
  }
}

function persistExportSettings() {
  if (!state.exportSettings) return;
  try {
    window.localStorage.setItem(EXPORT_PREVIEW_STORAGE_KEY, JSON.stringify(state.exportSettings));
  } catch (_error) {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

function createAccountId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let output = "";
  for (let i = 0; i < 14; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

function ensureAccountId() {
  try {
    const cached = window.localStorage.getItem(ACCOUNT_ID_STORAGE_KEY);
    if (cached) {
      state.accountId = cached;
      return;
    }
    const next = createAccountId();
    window.localStorage.setItem(ACCOUNT_ID_STORAGE_KEY, next);
    state.accountId = next;
  } catch (_error) {
    state.accountId = createAccountId();
  }
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - (Number(timestamp) || Date.now());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) {
    return `${Math.max(1, Math.round(diff / minute))}分钟前`;
  }
  if (diff < day) {
    return `${Math.max(1, Math.round(diff / hour))}小时前`;
  }
  return `${Math.max(1, Math.round(diff / day))}天前`;
}

function sanitizeStoredPreview(url) {
  const safe = String(url || "");
  if (!safe || safe.startsWith("blob:")) return "";
  return safe;
}

function serializeWorkLibrary() {
  return state.workLibrary.map((item) => ({
    ...item,
    previewImages: {
      origin: sanitizeStoredPreview(item.previewImages && item.previewImages.origin),
      ai: sanitizeStoredPreview(item.previewImages && item.previewImages.ai),
      grid: sanitizeStoredPreview(item.previewImages && item.previewImages.grid)
    }
  }));
}

function persistWorkLibrary() {
  try {
    window.localStorage.setItem(WORK_LIBRARY_STORAGE_KEY, JSON.stringify(serializeWorkLibrary()));
  } catch (_error) {
    // Ignore storage issues.
  }
}

function loadWorkLibrary() {
  try {
    const raw = window.localStorage.getItem(WORK_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.workLibrary = Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    state.workLibrary = [];
  }
}

function getSquareHotScore(item) {
  return item.views * 0.2 + item.likes * 2 + item.favorites * 3 + item.clones * 2;
}

function matchSquareMainTag(item) {
  const square = state.square;
  if (square.activeTag === "全部") return true;
  if (square.activeMainNav === "scene") {
    return item.scene === square.activeTag;
  }
  if (square.activeMainNav === "people") {
    return Array.isArray(item.audience) && item.audience.includes(square.activeTag);
  }
  if (square.activeMainNav === "difficulty") {
    return item.difficulty === square.activeTag;
  }
  if (square.activeTag === "新手友好") return item.difficulty === "入门";
  if (square.activeTag === "高复用") return item.clones >= 40;
  if (square.activeTag === "节日热榜") return item.theme === "节日" || item.scene === "节日装饰";
  return true;
}

function sortSquareItems(items) {
  const square = state.square;
  const list = [...items];
  if (square.activeSortNav === "all") {
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  if (square.activeSortNav === "featured") {
    return list
      .filter((item) => Boolean(item.official))
      .sort((a, b) => getSquareHotScore(b) - getSquareHotScore(a));
  }
  return list.sort((a, b) => getSquareHotScore(b) - getSquareHotScore(a));
}

function applySquareFilters() {
  const square = state.square;
  const keyword = String(square.searchKeyword || "").trim().toLowerCase();
  const filtered = square.papers.filter((item) => {
    const matchesKeyword = !keyword
      || item.title.toLowerCase().includes(keyword)
      || item.author.toLowerCase().includes(keyword)
      || item.theme.toLowerCase().includes(keyword)
      || item.scene.toLowerCase().includes(keyword);
    return matchesKeyword && matchSquareMainTag(item);
  });
  square.displayPapers = sortSquareItems(filtered);
}

function updateSquarePaperList(id, updater) {
  state.square.papers = state.square.papers.map((item) => (item.id === id ? updater(item) : item));
  applySquareFilters();
  renderSquareView();
}

function getExportModeOptions(format) {
  if (format === "png") {
    return [
      {
        value: "standard",
        label: "标准高清单图",
        hint: "适合快速保存和手机查看，清晰度高于普通截图。"
      },
      {
        value: "ultra",
        label: "超清单图",
        hint: "单张大图，适合电子存档和局部放大查看。"
      }
    ];
  }

  return [
    {
      value: "a4",
      label: "A4 分页详图",
      hint: "默认推荐：1 张总览 + 多张清晰分页详图，超大尺寸也不容易糊。"
    },
    {
      value: "ultra",
      label: "单张超大 PDF",
      hint: "导出为单页大画布，适合电子查看或后续再排版。"
    }
  ];
}

function getActiveExportFormat() {
  return state.exportSettings && state.exportSettings.format === "png" ? "png" : "pdf";
}

function getActiveExportMode() {
  const format = getActiveExportFormat();
  if (format === "png") {
    return state.exportSettings && state.exportSettings.pngMode === "standard" ? "standard" : "ultra";
  }
  return state.exportSettings && state.exportSettings.pdfMode === "ultra" ? "ultra" : "a4";
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setButtons(enabled) {
  exportPngButton.disabled = !enabled;
  exportPdfButton.disabled = !enabled;
}

function normalizeWorkName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getEffectiveWorkName() {
  const normalized = normalizeWorkName(workNameInput ? workNameInput.value : state.workName);
  if (normalized) return normalized;
  if (state.sourceFile && state.sourceFile.name) {
    const base = state.sourceFile.name.replace(/\.[^.]+$/, "");
    const fromFile = normalizeWorkName(base);
    if (fromFile) return fromFile;
  }
  return "豆像工坊-拼豆图纸";
}

function getCurrentStyleMode() {
  if (!styleModeSelect || styleModeSelect.value !== STYLE_MODE_CARTOON) {
    return STYLE_MODE_FINE;
  }
  return STYLE_MODE_CARTOON;
}

function getStylizedLabel() {
  return getCurrentStyleMode() === STYLE_MODE_CARTOON ? "Q版图" : "AI图";
}

function updateStyleModeHint() {
  if (!styleModeHintEl) return;
  styleModeHintEl.textContent = getCurrentStyleMode() === STYLE_MODE_CARTOON
    ? "卡通像素会先生成 Q 版中间稿，再继续转为拼豆图纸，更适合头像、萌系IP和礼物款。"
    : "精致像素直接转拼豆图纸，细节保留更多，适合照片和写实插画。";
  if (stylizedPreviewLabel) {
    stylizedPreviewLabel.textContent = getStylizedLabel();
  }
}

function setGeneratingState(next) {
  state.isGenerating = Boolean(next);
  const disabled = !state.sourceFile || state.isGenerating;
  if (generateNowButton) {
    generateNowButton.disabled = disabled;
  }
  if (regenerateButton) {
    regenerateButton.disabled = disabled;
  }
  if (clearWorkspaceButton) {
    clearWorkspaceButton.disabled = state.isGenerating;
  }
  refreshColorUsageStatus();
}

function revokeObjectUrlIfNeeded(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function setPreviewUrl(key, nextUrl) {
  const field = `${key}PreviewUrl`;
  const prevUrl = state[field];
  if (prevUrl && prevUrl !== nextUrl) {
    revokeObjectUrlIfNeeded(prevUrl);
  }
  state[field] = nextUrl || "";
}

function updatePreviewCard(cardEl, imageEl, placeholderEl, metaEl, payload = {}) {
  if (!cardEl || !imageEl || !placeholderEl || !metaEl) return;
  const src = String(payload.src || "");
  const meta = String(payload.meta || "");
  const placeholder = String(payload.placeholder || "");
  const busy = Boolean(payload.busy);
  const ready = Boolean(src);

  imageEl.hidden = !ready;
  if (ready) {
    imageEl.src = src;
  } else {
    imageEl.removeAttribute("src");
  }
  placeholderEl.hidden = ready;
  placeholderEl.textContent = placeholder;
  metaEl.textContent = meta;
  cardEl.disabled = !ready;
  cardEl.classList.toggle("is-ready", ready);
  cardEl.classList.toggle("is-busy", busy);
}

function syncWorkflowPreviewUI() {
  updateStyleModeHint();
  if (stylizedPreviewImage) {
    stylizedPreviewImage.classList.toggle("workflow-thumb-image-pixel", getCurrentStyleMode() !== STYLE_MODE_CARTOON);
  }
  updatePreviewCard(originPreviewCard, originPreviewImage, originPreviewPlaceholder, originPreviewMeta, {
    src: state.sourcePreviewUrl,
    placeholder: "上传后显示原图",
    meta: state.sourceFile
      ? "点击可放大查看裁剪后的原图。"
      : "建议裁剪到头像或上半身，主体更稳定。"
  });
  updatePreviewCard(stylizedPreviewCard, stylizedPreviewImage, stylizedPreviewPlaceholder, stylizedPreviewMeta, {
    src: state.stylizedPreviewUrl,
    busy: state.isGenerating && !state.stylizedPreviewUrl,
    placeholder: state.isGenerating
      ? `${getStylizedLabel()}生成中...`
      : `生成后显示${getStylizedLabel()}`,
    meta: state.stylizedPreviewUrl
      ? `点击可放大查看${getStylizedLabel()}中间稿。`
      : getCurrentStyleMode() === STYLE_MODE_CARTOON
        ? "Q版模式会先生成中间稿，再继续转图纸。"
        : "精致像素模式不会单独生成Q版中间稿。"
  });
  updatePreviewCard(gridPreviewCard, gridPreviewImage, gridPreviewPlaceholder, gridPreviewMeta, {
    src: state.gridPreviewUrl,
    busy: state.isGenerating && !state.gridPreviewUrl,
    placeholder: state.isGenerating ? "图纸生成中..." : "生成后显示拼豆图纸",
    meta: state.gridPreviewUrl
      ? "点击可查看完整图纸预览。"
      : "支持放大看格子、导出 PNG/PDF 和色号统计。"
  });
}

function resetGeneratedPreviewState() {
  setPreviewUrl("stylized", "");
  setPreviewUrl("grid", "");
  state.generatedStylizedFile = null;
  state.stylizedSourceFingerprint = "";
}

function buildSourceFingerprint(file) {
  if (!file) return "";
  return [file.name || "", file.size || 0, file.lastModified || 0].join(":");
}

function getWechatOpenGuide() {
  if (IS_IOS_DEVICE) {
    return "请点右上角“...”并选择“在Safari中打开”，再导出 PNG/PDF。";
  }
  return "请点右上角“...”并选择“在浏览器打开”，再导出 PNG/PDF。";
}

function updateWechatNoticeVisibility() {
  if (!wechatExportNoticeEl) return;
  wechatExportNoticeEl.hidden = !IS_WECHAT_BROWSER;
  if (!IS_WECHAT_BROWSER || !wechatExportNoticeTextEl) return;
  wechatExportNoticeTextEl.textContent = `检测到你正在微信内打开，导出文件可能被拦截。${getWechatOpenGuide()}`;
}

async function copyCurrentPageLink() {
  const url = window.location.href;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(url);
    return;
  }

  const tempInput = document.createElement("textarea");
  tempInput.value = url;
  tempInput.setAttribute("readonly", "readonly");
  tempInput.style.position = "fixed";
  tempInput.style.left = "-9999px";
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  tempInput.remove();
}

function blockExportInWechat() {
  if (!IS_WECHAT_BROWSER) return false;
  setStatus(`微信内置浏览器通常会拦截下载。${getWechatOpenGuide()}`);
  if (wechatExportNoticeEl) wechatExportNoticeEl.hidden = false;
  return true;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Delay revoke to avoid some browsers canceling the download too early.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 3000);
}

function clearLegend() {
  legendEl.innerHTML = "";
}

function updateLegendToggle(totalColors) {
  if (!legendToggleButton) return;
  if (!totalColors || totalColors <= 8) {
    legendToggleButton.hidden = true;
    return;
  }
  legendToggleButton.hidden = false;
  legendToggleButton.textContent = state.legendExpanded
    ? `收起颜色明细（共 ${totalColors} 种）`
    : `展开全部颜色明细（共 ${totalColors} 种）`;
}

function renderLegend(legend) {
  clearLegend();
  const sortedLegend = sortLegendItems(legend);
  const visible = state.legendExpanded ? sortedLegend : sortedLegend.slice(0, 8);
  visible.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    const swatchHex = item.hex || item.color;
    swatch.style.background = swatchHex;

    const meta = document.createElement("div");
    meta.className = "legend-meta";
    const head = item.code ? `${item.code}` : `#${item.index}`;
    meta.innerHTML = `<strong>${head}</strong><span>${item.count} 颗 (${item.percent}%)</span>`;

    wrapper.appendChild(swatch);
    wrapper.appendChild(meta);
    legendEl.appendChild(wrapper);
  });
  updateLegendToggle(sortedLegend.length);
}

function getPaletteUsageDescription() {
  if (!paletteSelect || paletteSelect.selectedIndex < 0) return "当前色盘";
  const option = paletteSelect.options[paletteSelect.selectedIndex];
  const paletteName = option && option.textContent ? option.textContent.trim() : "当前色盘";
  if (paletteSelect.value === "auto") return "自动聚类配色";
  return `已按 ${paletteName} 色盘固定配色`;
}

function updateUploadFilename() {
  if (!uploadFilenameEl) return;
  if (state.sourceFile && state.sourceFile.name) {
    uploadFilenameEl.textContent = `已选择：${state.sourceFile.name}`;
    return;
  }
  const pending = imageInput && imageInput.files && imageInput.files[0] ? imageInput.files[0].name : "";
  uploadFilenameEl.textContent = pending ? `待裁剪：${pending}` : "未选择图片";
}

function openImagePicker() {
  imageInput.click();
}

function updatePreviewEmptyState() {
  if (!previewEmptyState) return;
  const shouldShowEmpty = !state.sourceFile && !state.grid;
  previewEmptyState.hidden = !shouldShowEmpty;
  patternViewport.classList.toggle("is-empty", shouldShowEmpty);
}

function refreshColorUsageStatus() {
  if (!usageStatusEl) return;
  if (state.legend && state.legend.length) {
    usageStatusEl.textContent = `当前参数下将使用 ${state.legend.length} 种颜色（${getPaletteUsageDescription()}）`;
    return;
  }

  if (state.sourceFile) {
    if (state.isGenerating) {
      usageStatusEl.textContent = `正在按${getPaletteUsageDescription()}生成图纸，请稍候。`;
      return;
    }
    usageStatusEl.textContent = `尚未生成，正在按${getPaletteUsageDescription()}计算颜色。`;
    return;
  }

  usageStatusEl.textContent = "当前参数下将使用 - 种颜色";
}

function setEffectComparePosition(position) {
  if (!effectCompareStage) return;
  const safe = clamp(Number(position), 0, 100);
  effectCompareStage.style.setProperty("--compare-pos", `${safe}%`);
}

function getEffectComparePosition() {
  if (!effectCompareStage) return 52;
  const inlineValue = effectCompareStage.style.getPropertyValue("--compare-pos");
  const cssValue = inlineValue || window.getComputedStyle(effectCompareStage).getPropertyValue("--compare-pos");
  const parsed = Number.parseFloat(cssValue);
  if (!Number.isFinite(parsed)) return 52;
  return clamp(parsed, 0, 100);
}

function getEffectComparePositionFromClientX(clientX) {
  if (!effectCompareStage) return 52;
  const rect = effectCompareStage.getBoundingClientRect();
  if (!rect.width) return 52;
  const ratio = (clientX - rect.left) / rect.width;
  return clamp(ratio * 100, 0, 100);
}

function applyEffectViewTransform() {
  if (!effectCompareStage) return;
  effectCompareStage.style.setProperty("--effect-scale", String(effectViewScale));
}

function setEffectViewScale(nextScale) {
  const safe = clamp(nextScale, 1, 8);
  if (Math.abs(safe - effectViewScale) < 0.0001) return;
  effectViewScale = safe;
  applyEffectViewTransform();
}

function resetEffectViewScale() {
  effectViewScale = 1;
  applyEffectViewTransform();
}

function getEffectPointerDistance() {
  const points = Array.from(effectViewPointers.values());
  if (points.length < 2) return 0;
  const [a, b] = points;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function openEffectModal(src, title, options = {}) {
  if (!effectModal || !effectModalImage || !effectModalTitle || !effectModalViewport) return;
  effectModalImage.src = src;
  effectModalTitle.textContent = title;
  effectModalImage.classList.toggle("is-pixel", Boolean(options.pixelated));
  effectModal.hidden = false;
  syncBodyModalState();
  const syncModalZoom = () => {
    if (!effectModalImage.naturalWidth || !effectModalImage.naturalHeight) return;
    effectModalZoom.setContent(effectModalImage, effectModalImage.naturalWidth, effectModalImage.naturalHeight);
  };
  if (effectModalImage.complete) {
    window.requestAnimationFrame(syncModalZoom);
  } else {
    effectModalImage.addEventListener("load", syncModalZoom, { once: true });
  }
}

function closeEffectModal() {
  if (!effectModal || effectModal.hidden) return;
  effectModal.hidden = true;
  effectModalZoom.clear();
  if (effectModalImage) {
    effectModalImage.removeAttribute("src");
  }
  syncBodyModalState();
}

function openScenarioModalPanel() {
  if (!scenarioModal) return;
  scenarioModal.hidden = false;
  syncBodyModalState();
}

function closeScenarioModalPanel() {
  if (!scenarioModal || scenarioModal.hidden) return;
  scenarioModal.hidden = true;
  syncBodyModalState();
}

function openEffectShowcaseModalPanel() {
  if (!effectShowcaseModal) return;
  effectShowcaseModal.hidden = false;
  syncBodyModalState();
}

function closeEffectShowcaseModalPanel() {
  if (!effectShowcaseModal || effectShowcaseModal.hidden) return;
  effectShowcaseModal.hidden = true;
  syncBodyModalState();
}

function getUltraPngSize(gridSize) {
  const preferred = Math.round(gridSize * PNG_EXPORT_TARGET_CELL_SIZE + 180);
  return clamp(preferred, PNG_EXPORT_MIN_SIZE, PNG_EXPORT_MAX_SIZE);
}

function getStandardPngSize(gridSize) {
  const preferred = Math.round(gridSize * PNG_EXPORT_STANDARD_CELL_SIZE + 160);
  return clamp(preferred, PNG_EXPORT_STANDARD_MIN_SIZE, PNG_EXPORT_STANDARD_MAX_SIZE);
}

function sortLegendItems(legend) {
  if (!Array.isArray(legend)) return [];
  return [...legend].sort((a, b) => {
    const countDiff = (b.count || 0) - (a.count || 0);
    if (countDiff !== 0) return countDiff;
    const codeA = a.code || "";
    const codeB = b.code || "";
    return codeA.localeCompare(codeB, "zh-CN");
  });
}

function computeA4DetailPlan(gridSize) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 36;
  const headerHeight = 54;
  const footerHeight = 22;
  const coordBand = 18;
  const availableWidth = pageWidth - margin * 2 - coordBand * 2;
  const availableHeight = pageHeight - margin * 2 - headerHeight - footerHeight - coordBand * 2 - 20;
  const maxCellsByArea = Math.max(12, Math.floor(Math.min(availableWidth, availableHeight) / 14));
  const cellsPerPage = Math.min(gridSize, Math.max(12, Math.min(32, maxCellsByArea)));
  return {
    cellsPerPage,
    pagesX: Math.max(1, Math.ceil(gridSize / cellsPerPage)),
    pagesY: Math.max(1, Math.ceil(gridSize / cellsPerPage))
  };
}

function buildGridCanvas(size, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  drawGrid(canvas, options.grid, {
    gridLines: true,
    axisLabels: true,
    axisLabelStep: 1,
    axisColor: "#111111",
    tintAlpha: options.tintAlpha || 0.2,
    showCodes: options.showCodes,
    codeByHex: options.codeByHex,
    codeGrid: options.codeGrid
  });
  return canvas;
}

function buildPixelPreviewDataUrl(grid) {
  if (!Array.isArray(grid) || !grid.length) return "";
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = 720;
  previewCanvas.height = 720;
  drawGrid(previewCanvas, grid, {
    gridLines: false,
    axisLabels: false,
    showCodes: false,
    tintAlpha: 0
  });
  return previewCanvas.toDataURL("image/png");
}

function buildGridPreviewDataUrl(grid) {
  if (!Array.isArray(grid) || !grid.length) return "";
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = 720;
  previewCanvas.height = 720;
  drawGrid(previewCanvas, grid, {
    gridLines: true,
    axisLabels: false,
    showCodes: false,
    tintAlpha: 0
  });
  return previewCanvas.toDataURL("image/png");
}

function drawLegendSection(ctx, legend, layout) {
  const items = sortLegendItems(legend);
  if (!items.length) return;

  ctx.save();
  ctx.font = `700 ${layout.headerFontSize}px "Segoe UI", sans-serif`;
  ctx.fillStyle = "#21160d";
  ctx.fillText("颜色图例 / 颗粒统计", layout.x, layout.y + layout.headerFontSize);
  ctx.restore();

  items.forEach((item, index) => {
    const col = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const cardX = layout.x + col * (layout.cardWidth + layout.gapX);
    const cardY = layout.y + layout.headerHeight + row * (layout.cardHeight + layout.gapY);
    const swatchHex = item.hex || item.color || "#000000";
    const code = item.code || `#${item.index}`;

    ctx.save();
    ctx.fillStyle = "#fffaf1";
    ctx.strokeStyle = "#deceb1";
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, cardX, cardY, layout.cardWidth, layout.cardHeight, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = swatchHex;
    ctx.fillRect(cardX + 18, cardY + 18, layout.swatchSize, layout.swatchSize);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.strokeRect(cardX + 18, cardY + 18, layout.swatchSize, layout.swatchSize);

    ctx.fillStyle = "#1f1f1f";
    ctx.font = `700 ${layout.codeFontSize}px "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(code, cardX + 18 + layout.swatchSize + 18, cardY + 14);

    ctx.fillStyle = "#5b5145";
    ctx.font = `${layout.metaFontSize}px "Segoe UI", sans-serif`;
    ctx.fillText(`${item.count} 颗`, cardX + 18 + layout.swatchSize + 18, cardY + 14 + layout.codeFontSize + 8);
    ctx.fillText(`${item.percent}%`, cardX + 18 + layout.swatchSize + 18, cardY + 14 + layout.codeFontSize + layout.metaFontSize + 18);
    ctx.restore();
  });
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function computePosterLayout(baseWidth, legendCount) {
  const padding = Math.max(34, Math.round(baseWidth * 0.035));
  const gridSize = baseWidth - padding * 2;
  const columns = legendCount >= 10 ? 3 : legendCount >= 5 ? 2 : 1;
  const gapX = Math.max(18, Math.round(baseWidth * 0.014));
  const gapY = Math.max(14, Math.round(baseWidth * 0.012));
  const cardWidth = Math.floor((baseWidth - padding * 2 - gapX * (columns - 1)) / columns);
  const cardHeight = Math.max(78, Math.round(baseWidth * 0.105));
  const rows = Math.max(1, Math.ceil(Math.max(1, legendCount) / columns));
  const headerHeight = Math.max(46, Math.round(baseWidth * 0.038));
  const legendHeight = headerHeight + rows * cardHeight + (rows - 1) * gapY;
  return {
    width: baseWidth,
    height: padding + gridSize + Math.max(28, Math.round(baseWidth * 0.02)) + legendHeight + padding,
    padding,
    gridSize,
    legend: {
      x: padding,
      y: padding + gridSize + Math.max(28, Math.round(baseWidth * 0.02)),
      columns,
      gapX,
      gapY,
      cardWidth,
      cardHeight,
      swatchSize: Math.max(18, Math.round(baseWidth * 0.022)),
      headerHeight,
      headerFontSize: Math.max(18, Math.round(baseWidth * 0.018)),
      codeFontSize: Math.max(18, Math.round(baseWidth * 0.02)),
      metaFontSize: Math.max(15, Math.round(baseWidth * 0.015))
    }
  };
}

function renderPosterToCanvas(canvas, options) {
  const legendItems = sortLegendItems(options.legend);
  const layout = computePosterLayout(options.baseWidth, legendItems.length);
  canvas.width = layout.width;
  canvas.height = layout.height;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f4ecdf";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gridCanvas = buildGridCanvas(layout.gridSize, {
    grid: options.grid,
    showCodes: options.showCodes,
    codeGrid: options.codeGrid,
    codeByHex: options.codeByHex,
    tintAlpha: 0.18
  });
  ctx.drawImage(gridCanvas, layout.padding, layout.padding, layout.gridSize, layout.gridSize);
  drawLegendSection(ctx, legendItems, layout.legend);

  return {
    width: layout.width,
    height: layout.height
  };
}

function getTextColor(hex) {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 160 ? "#111111" : "#FFFFFF";
}

function hasCodeData() {
  return Boolean(state.codeGrid || state.codeByHex);
}

function syncBodyModalState() {
  const isAnyModalOpen =
    !zoomModal.hidden
    || !cropModal.hidden
    || (scenarioModal && !scenarioModal.hidden)
    || (effectShowcaseModal && !effectShowcaseModal.hidden)
    || (effectModal && !effectModal.hidden)
    || (exportModal && !exportModal.hidden);
  document.body.classList.toggle("modal-open", isAnyModalOpen);
}

function syncExportModeOptions() {
  if (!exportFormatSelect || !exportModeSelect) return;
  const format = getActiveExportFormat();
  const options = getExportModeOptions(format);
  const activeMode = getActiveExportMode();
  exportModeSelect.innerHTML = "";
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    exportModeSelect.appendChild(option);
  });
  exportModeSelect.value = options.some((item) => item.value === activeMode) ? activeMode : options[0].value;
  const selected = options.find((item) => item.value === exportModeSelect.value) || options[0];
  if (exportModeHintEl) {
    exportModeHintEl.textContent = selected.hint;
  }
}

function getExportPresetLabel() {
  const format = getActiveExportFormat();
  const mode = getActiveExportMode();
  if (format === "png") {
    if (mode === "standard") {
      return "PNG 将导出为带图例与颗粒统计的单张高清图，适合快速保存与转发。";
    }
    return "PNG 将导出为带图例与颗粒统计的超清单图，更适合放大查看细节。";
  }
  if (mode === "ultra") {
    return "PDF 将导出为单张超大矢量图纸，适合在电脑上放大查看或二次排版。";
  }
  return "PDF 默认导出为 A4 分页详图：先给总览，再自动拆成更清晰的分页图纸。";
}

function renderExportPreview() {
  if (!exportPreviewCanvas || !exportPlanSummaryEl || !exportPresetHintEl || !exportLargeHintEl) return;
  const ctx = exportPreviewCanvas.getContext("2d");
  const width = exportPreviewCanvas.width;
  const height = exportPreviewCanvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f3e7d4";
  ctx.fillRect(0, 0, width, height);
  exportPresetHintEl.textContent = `${getExportPresetLabel()} 格内色号跟随上方“显示 MARD 色号”设置。`;

  if (!state.grid || !state.legend) {
    ctx.fillStyle = "#6e614e";
    ctx.font = '600 28px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("生成图纸后，这里会显示导出预览", width / 2, height / 2);
    exportPlanSummaryEl.textContent = "上传并生成图纸后，可在这里预览导出布局。";
    exportLargeHintEl.textContent = "";
    return;
  }

  const format = getActiveExportFormat();
  const mode = getActiveExportMode();
  const plan = computeA4DetailPlan(state.grid.length);
  const gridCanvas = buildGridCanvas(360, {
    grid: state.grid,
    showCodes: false,
    codeGrid: state.codeGrid,
    codeByHex: state.codeByHex,
    tintAlpha: 0.18
  });

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d9c6ab";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(88, 50, 10, 0.12)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;

  if (format === "pdf" && mode === "a4") {
    const paperX = 70;
    const paperY = 34;
    const paperW = 500;
    const paperH = 652;
    ctx.fillRect(paperX, paperY, paperW, paperH);
    ctx.strokeRect(paperX, paperY, paperW, paperH);
    ctx.shadowColor = "transparent";
    ctx.drawImage(gridCanvas, paperX + 72, paperY + 58, 356, 356);

    const sliceW = 356 / plan.pagesX;
    const sliceH = 356 / plan.pagesY;
    ctx.strokeStyle = "rgba(186,31,31,0.82)";
    ctx.lineWidth = 3;
    for (let ix = 1; ix < plan.pagesX; ix += 1) {
      const x = paperX + 72 + sliceW * ix;
      ctx.beginPath();
      ctx.moveTo(x, paperY + 58);
      ctx.lineTo(x, paperY + 414);
      ctx.stroke();
    }
    for (let iy = 1; iy < plan.pagesY; iy += 1) {
      const y = paperY + 58 + sliceH * iy;
      ctx.beginPath();
      ctx.moveTo(paperX + 72, y);
      ctx.lineTo(paperX + 428, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff8ee";
    ctx.strokeStyle = "#dec9aa";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < Math.min(4, state.legend.length); i += 1) {
      const cardY = paperY + 446 + i * 42;
      ctx.fillRect(paperX + 40, cardY, 420, 34);
      ctx.strokeRect(paperX + 40, cardY, 420, 34);
    }

    exportPlanSummaryEl.textContent = `A4 模式将导出 1 张总览 + ${plan.pagesX * plan.pagesY} 张分页详图。`;
    exportLargeHintEl.textContent =
      plan.pagesX * plan.pagesY > 1
        ? `当前 ${state.grid.length} x ${state.grid.length} 图纸会拆成 ${plan.pagesX} x ${plan.pagesY} 个分页区块，细节更清晰。`
        : "";
  } else {
    const previewWidth = format === "png" ? 540 : 520;
    const previewHeight = format === "png" ? 650 : 620;
    const posterX = Math.floor((width - previewWidth) / 2);
    const posterY = Math.floor((height - previewHeight) / 2);
    ctx.fillRect(posterX, posterY, previewWidth, previewHeight);
    ctx.strokeRect(posterX, posterY, previewWidth, previewHeight);
    ctx.shadowColor = "transparent";
    ctx.drawImage(gridCanvas, posterX + 46, posterY + 34, previewWidth - 92, previewWidth - 92);
    ctx.fillStyle = "#fff8ee";
    ctx.strokeStyle = "#dec9aa";
    for (let i = 0; i < Math.min(6, state.legend.length); i += 1) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cardX = posterX + 34 + col * ((previewWidth - 86) / 2);
      const cardY = posterY + previewWidth - 36 + row * 44;
      ctx.fillRect(cardX, cardY, (previewWidth - 100) / 2, 34);
      ctx.strokeRect(cardX, cardY, (previewWidth - 100) / 2, 34);
    }
    exportPlanSummaryEl.textContent = format === "png"
      ? `PNG 将导出为 1 张带图例的${mode === "standard" ? "高清" : "超清"}图纸。`
      : "将导出为 1 张超大单页 PDF。";
    exportLargeHintEl.textContent =
      format === "png" && state.grid.length >= 104
        ? "超大图纸若需要更稳的清晰度，建议优先选择 PDF 的 A4 分页详图。"
        : "";
  }

  ctx.restore();
}

function syncExportControls() {
  if (!exportFormatSelect) return;
  exportFormatSelect.value = getActiveExportFormat();
  syncExportModeOptions();
  renderExportPreview();
}

function openExportModal(preferredFormat) {
  if (!state.grid || !state.legend || !exportModal) return;
  const safeFormat = preferredFormat === "png" ? "png" : "pdf";
  state.exportSettings.format = safeFormat;
  if (safeFormat === "pdf" && !state.exportSettings.pdfMode) {
    state.exportSettings.pdfMode = "a4";
  }
  if (safeFormat === "png" && !state.exportSettings.pngMode) {
    state.exportSettings.pngMode = "ultra";
  }
  syncExportControls();
  exportModal.hidden = false;
  syncBodyModalState();
}

function closeExportModal() {
  if (!exportModal || exportModal.hidden) return;
  exportModal.hidden = true;
  syncBodyModalState();
}

async function exportPngFromSettings() {
  const mode = getActiveExportMode();
  const baseWidth = mode === "standard"
    ? getStandardPngSize(state.grid.length)
    : getUltraPngSize(state.grid.length);
  const exportCanvas = document.createElement("canvas");
  renderPosterToCanvas(exportCanvas, {
    baseWidth,
    grid: state.grid,
    legend: state.legend,
    showCodes: showCodesInput.checked,
    codeGrid: state.codeGrid,
    codeByHex: state.codeByHex
  });

  return new Promise((resolve) => {
    exportCanvas.toBlob((blob) => {
      resolve(blob || null);
    });
  });
}

async function exportPdfFromSettings() {
  const mode = getActiveExportMode();
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grid: state.grid,
      legend: state.legend,
      codeGrid: showCodesInput.checked ? state.codeGrid : null,
      title: getEffectiveWorkName(),
      pdfMode: mode
    })
  });

  if (!res.ok) {
    throw new Error("pdf-export-failed");
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    throw new Error("pdf-export-invalid");
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new Error("pdf-export-empty");
  }
  return blob;
}

async function handleExportConfirm() {
  if (!state.grid || !state.legend) return;
  if (blockExportInWechat()) return;

  const format = getActiveExportFormat();
  const mode = getActiveExportMode();
  exportConfirmButton.disabled = true;

  try {
    const safeName = getEffectiveWorkName();
    if (format === "png") {
      setStatus(`正在准备${mode === "standard" ? "高清" : "超清"} PNG...`);
      const blob = await exportPngFromSettings();
      if (!blob) {
        setStatus("PNG 导出失败。");
        return;
      }
      downloadBlob(blob, `${safeName}-${mode}.png`);
      const sizeKb = Math.max(1, Math.round(blob.size / 1024));
      setStatus(`PNG 导出完成（${sizeKb} KB）。`);
    } else {
      setStatus(`正在准备${mode === "a4" ? "A4 分页" : "超大单页"} PDF...`);
      const blob = await exportPdfFromSettings();
      downloadBlob(blob, `${safeName}-${mode}.pdf`);
      const sizeKb = Math.max(1, Math.round(blob.size / 1024));
      setStatus(`PDF 导出完成（${sizeKb} KB）。`);
    }
    persistExportSettings();
    closeExportModal();
  } catch (_error) {
    setStatus(`${format.toUpperCase()} 导出失败。`);
  } finally {
    exportConfirmButton.disabled = false;
  }
}

function createZoomController(viewportEl, options = {}) {
  const stateZoom = {
    activeEl: null,
    contentWidth: 0,
    contentHeight: 0,
    baseScale: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    minZoom: 1,
    maxZoom: 18,
    enabled: false,
    dragging: false,
    pinching: false,
    suppressClick: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    activePointers: new Map(),
    pinchStartDistance: 0,
    pinchStartZoom: 1
  };

  function getPointerPairDistance() {
    const points = Array.from(stateZoom.activePointers.values());
    if (points.length < 2) return 0;
    const [a, b] = points;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.hypot(dx, dy);
  }

  function getMetrics() {
    const rect = viewportEl.getBoundingClientRect();
    stateZoom.viewportWidth = rect.width;
    stateZoom.viewportHeight = rect.height;
    return {
      enabled: stateZoom.enabled,
      contentWidth: stateZoom.contentWidth,
      contentHeight: stateZoom.contentHeight,
      panX: stateZoom.panX,
      panY: stateZoom.panY,
      baseScale: stateZoom.baseScale,
      zoom: stateZoom.zoom,
      scale: stateZoom.baseScale * stateZoom.zoom,
      viewportWidth: stateZoom.viewportWidth,
      viewportHeight: stateZoom.viewportHeight
    };
  }

  function emitTransform() {
    if (typeof options.onTransform === "function") {
      options.onTransform(getMetrics());
    }
  }

  function applyTransform() {
    if (!stateZoom.enabled || !stateZoom.activeEl) return;
    const scale = stateZoom.baseScale * stateZoom.zoom;
    stateZoom.activeEl.style.transform = `translate(-50%, -50%) translate(${stateZoom.panX}px, ${stateZoom.panY}px) scale(${scale})`;
    emitTransform();
  }

  function recalculateBaseScale() {
    if (!stateZoom.enabled || !stateZoom.activeEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const scaleX = rect.width / stateZoom.contentWidth;
    const scaleY = rect.height / stateZoom.contentHeight;
    stateZoom.baseScale = Math.min(scaleX, scaleY);
    applyTransform();
  }

  function emitZoomChange() {
    if (typeof options.onZoomChange === "function") {
      options.onZoomChange(stateZoom.zoom);
    }
  }

  function setZoom(nextZoom) {
    const safeZoom = clamp(nextZoom, stateZoom.minZoom, stateZoom.maxZoom);
    if (Math.abs(safeZoom - stateZoom.zoom) < 0.0001) return;
    stateZoom.zoom = safeZoom;
    applyTransform();
    emitZoomChange();
  }

  function reset() {
    if (!stateZoom.enabled) return;
    stateZoom.zoom = 1;
    stateZoom.panX = 0;
    stateZoom.panY = 0;
    recalculateBaseScale();
    emitZoomChange();
  }

  function clear() {
    if (stateZoom.activeEl) {
      stateZoom.activeEl.style.transform = "translate(-50%, -50%)";
      stateZoom.activeEl.style.width = "";
      stateZoom.activeEl.style.height = "";
    }
    stateZoom.activeEl = null;
    stateZoom.contentWidth = 0;
    stateZoom.contentHeight = 0;
    stateZoom.enabled = false;
    emitTransform();
  }

  function setContent(activeEl, width, height) {
    if (stateZoom.activeEl && stateZoom.activeEl !== activeEl) {
      stateZoom.activeEl.style.transform = "translate(-50%, -50%)";
    }

    stateZoom.activeEl = activeEl;
    stateZoom.contentWidth = width;
    stateZoom.contentHeight = height;
    stateZoom.enabled = Boolean(activeEl && width > 0 && height > 0);

    if (!stateZoom.enabled) {
      clear();
      return;
    }

    activeEl.style.width = `${width}px`;
    activeEl.style.height = `${height}px`;
    reset();
  }

  viewportEl.addEventListener(
    "wheel",
    (event) => {
      const allowPlainWheel = Boolean(options.allowPlainWheel);
      if (!stateZoom.enabled || (!allowPlainWheel && !event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      const ratio = event.deltaY < 0 ? 1.12 : 0.9;
      setZoom(stateZoom.zoom * ratio);
    },
    { passive: false }
  );

  viewportEl.addEventListener("pointerdown", (event) => {
    if (!stateZoom.enabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (typeof options.shouldHandlePointerDown === "function" && !options.shouldHandlePointerDown(event)) {
      return;
    }
    stateZoom.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (stateZoom.activePointers.size >= 2) {
      if (typeof viewportEl.setPointerCapture === "function") {
        try {
          viewportEl.setPointerCapture(event.pointerId);
        } catch (_err) {
          // Ignore capture failures on unsupported platforms.
        }
      }
      stateZoom.pinching = true;
      stateZoom.dragging = false;
      stateZoom.suppressClick = true;
      stateZoom.pinchStartDistance = getPointerPairDistance();
      stateZoom.pinchStartZoom = stateZoom.zoom;
      viewportEl.classList.remove("is-dragging");
      return;
    }

    const allowTouchPageScrollAtBaseZoom = options.allowTouchPageScrollAtBaseZoom !== false;
    const isSingleTouch = event.pointerType === "touch" && stateZoom.activePointers.size === 1;
    const atBaseZoom = Math.abs(stateZoom.zoom - stateZoom.minZoom) < 0.001 || stateZoom.zoom <= 1.001;
    if (allowTouchPageScrollAtBaseZoom && isSingleTouch && atBaseZoom) {
      stateZoom.dragging = false;
      viewportEl.classList.remove("is-dragging");
      return;
    }

    if (typeof viewportEl.setPointerCapture === "function") {
      try {
        viewportEl.setPointerCapture(event.pointerId);
      } catch (_err) {
        // Ignore capture failures on unsupported platforms.
      }
    }

    stateZoom.dragging = true;
    stateZoom.startX = event.clientX;
    stateZoom.startY = event.clientY;
    stateZoom.startPanX = stateZoom.panX;
    stateZoom.startPanY = stateZoom.panY;
    viewportEl.classList.add("is-dragging");
  });

  window.addEventListener("pointermove", (event) => {
    if (!stateZoom.enabled) return;
    if (stateZoom.activePointers.has(event.pointerId)) {
      stateZoom.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (stateZoom.pinching && stateZoom.activePointers.size >= 2) {
      const dist = getPointerPairDistance();
      if (dist > 0 && stateZoom.pinchStartDistance > 0) {
        const ratio = dist / stateZoom.pinchStartDistance;
        setZoom(stateZoom.pinchStartZoom * ratio);
      }
      return;
    }

    if (!stateZoom.dragging) return;
    const dx = event.clientX - stateZoom.startX;
    const dy = event.clientY - stateZoom.startY;
    stateZoom.panX = stateZoom.startPanX + dx;
    stateZoom.panY = stateZoom.startPanY + dy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      stateZoom.suppressClick = true;
    }
    applyTransform();
  });

  const endPointer = (event) => {
    if (stateZoom.activePointers.has(event.pointerId)) {
      stateZoom.activePointers.delete(event.pointerId);
    }
    if (typeof viewportEl.releasePointerCapture === "function") {
      try {
        viewportEl.releasePointerCapture(event.pointerId);
      } catch (_err) {
        // Ignore release failures on unsupported platforms.
      }
    }

    if (stateZoom.pinching && stateZoom.activePointers.size < 2) {
      stateZoom.pinching = false;
    }

    if (stateZoom.activePointers.size === 1) {
      const remaining = Array.from(stateZoom.activePointers.values())[0];
      stateZoom.dragging = true;
      stateZoom.startX = remaining.x;
      stateZoom.startY = remaining.y;
      stateZoom.startPanX = stateZoom.panX;
      stateZoom.startPanY = stateZoom.panY;
      viewportEl.classList.add("is-dragging");
      return;
    }

    if (stateZoom.activePointers.size === 0) {
      stateZoom.dragging = false;
      viewportEl.classList.remove("is-dragging");
      if (stateZoom.suppressClick) {
        window.setTimeout(() => {
          stateZoom.suppressClick = false;
        }, 0);
      }
    }
  };

  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  viewportEl.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    if (!stateZoom.dragging) return;
    endPointer(event);
  });

  viewportEl.addEventListener("dblclick", () => {
    reset();
  });

  viewportEl.addEventListener("click", () => {
    if (stateZoom.suppressClick) return;
    if (typeof options.onViewClick === "function") {
      options.onViewClick();
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    recalculateBaseScale();
  });
  resizeObserver.observe(viewportEl);

  return {
    setContent,
    clear,
    reset,
    getZoom: () => stateZoom.zoom,
    getMetrics
  };
}

const patternZoom = createZoomController(patternViewport, {
  onZoomChange: () => {
    if (!state.grid) return;
    renderPatternCanvas(true);
    refreshReadyStatus();
  },
  onTransform: () => {
    renderPatternRulers();
  },
  onViewClick: () => {
    if (!state.grid) return;
    openPatternModal();
  }
});

const modalZoom = createZoomController(zoomModalViewport, {
  onZoomChange: () => {
    if (!state.grid || zoomModal.hidden) return;
    renderModalPattern();
  }
});

const effectModalZoom = createZoomController(effectModalViewport, {
  allowPlainWheel: true
});

function computeGridLayout(size, gridSize, axisLabels) {
  const axisPadding = axisLabels ? Math.max(22, Math.floor(size * 0.05)) : 0;
  const drawableSize = size - axisPadding * 2;
  const cellSize = Math.max(1, Math.floor(drawableSize / gridSize));
  const drawSize = cellSize * gridSize;
  const startX = Math.floor((size - drawSize) / 2);
  const startY = startX;
  return {
    gridSize,
    size,
    axisPadding,
    cellSize,
    drawSize,
    startX,
    startY
  };
}

function drawGrid(canvas, grid, options = {}) {
  const ctx = canvas.getContext("2d");
  const gridSize = grid.length;
  const size = canvas.width;
  const layout = computeGridLayout(size, gridSize, options.axisLabels);
  const { cellSize, drawSize, startX, startY } = layout;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = options.canvasBackground || "#f2efe8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(startX, startY, drawSize, drawSize);

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const cellHex = grid[y][x];
      if (cellHex) {
        ctx.fillStyle = cellHex;
        ctx.fillRect(startX + x * cellSize, startY + y * cellSize, cellSize, cellSize);
      }
    }
  }

  if (options.tintAlpha && options.tintAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${options.tintAlpha})`;
    ctx.fillRect(startX, startY, drawSize, drawSize);
  }

  if (options.showCodes) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const cellHex = grid[y][x];
        const rowCodes = options.codeGrid && options.codeGrid[y] ? options.codeGrid[y] : null;
        const cellCode = rowCodes ? rowCodes[x] : options.codeByHex ? options.codeByHex[cellHex] : null;
        if (cellCode && cellHex) {
          const fontSize = Math.max(5, Math.floor(cellSize * 0.55));
          ctx.fillStyle = getTextColor(cellHex);
          ctx.font = `${fontSize}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            cellCode,
            startX + x * cellSize + cellSize / 2,
            startY + y * cellSize + cellSize / 2
          );
        }
      }
    }
  }

  if (options.gridLines) {
    ctx.strokeStyle = options.gridColor || "rgba(0,0,0,0.24)";
    ctx.lineWidth = Math.max(0.4, cellSize * 0.08);
    ctx.setLineDash([]);

    for (let i = 0; i <= gridSize; i += 1) {
      const x = startX + i * cellSize;
      const y = startY + i * cellSize;

      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + drawSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + drawSize, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(186, 31, 31, 0.9)";
    ctx.lineWidth = Math.max(1, cellSize * 0.12);
    ctx.setLineDash([Math.max(2, Math.floor(cellSize * 0.85)), Math.max(2, Math.floor(cellSize * 0.65))]);

    for (let i = 5; i < gridSize; i += 5) {
      const x = startX + i * cellSize;
      const y = startY + i * cellSize;

      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + drawSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + drawSize, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.lineWidth = Math.max(1, cellSize * 0.16);
    ctx.strokeRect(startX, startY, drawSize, drawSize);
  }

  if (options.axisLabels) {
    const axisStepRaw = Number.parseInt(options.axisLabelStep, 10);
    const axisStep = Number.isNaN(axisStepRaw) ? 5 : clamp(axisStepRaw, 1, gridSize);
    const marks = [];
    for (let i = axisStep; i <= gridSize; i += axisStep) {
      marks.push(i);
    }
    if (!marks.includes(gridSize)) {
      marks.push(gridSize);
    }

    const axisFontSize = axisStep === 1
      ? Math.max(6, Math.floor(cellSize * 0.46))
      : Math.max(9, Math.floor(cellSize * 0.78));
    ctx.fillStyle = options.axisColor || "#a31515";
    ctx.font = `${axisFontSize}px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    marks.forEach((mark) => {
      const centerX = startX + (mark - 0.5) * cellSize;
      const centerY = startY + (mark - 0.5) * cellSize;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(mark), centerX, startY - Math.max(10, axisFontSize * 0.8));
      ctx.fillText(String(mark), centerX, startY + drawSize + Math.max(10, axisFontSize * 0.8));

      ctx.textAlign = "right";
      ctx.fillText(String(mark), startX - Math.max(8, axisFontSize * 0.6), centerY);
      ctx.textAlign = "left";
      ctx.fillText(String(mark), startX + drawSize + Math.max(8, axisFontSize * 0.6), centerY);
    });
  }

  return layout;
}

function clearPatternRulers() {
  patternRulerTop.style.display = "none";
  patternRulerBottom.style.display = "none";
  patternRulerLeft.style.display = "none";
  patternRulerRight.style.display = "none";
  patternRulerTop.innerHTML = "";
  patternRulerBottom.innerHTML = "";
  patternRulerLeft.innerHTML = "";
  patternRulerRight.innerHTML = "";
}

function addRulerCell(fragment, value, startPx, sizePx, axis) {
  const cell = document.createElement("span");
  cell.className = "ruler-cell";
  cell.textContent = String(value);
  if (axis === "x") {
    cell.style.left = `${startPx}px`;
    cell.style.width = `${sizePx}px`;
  } else {
    cell.style.top = `${startPx}px`;
    cell.style.height = `${sizePx}px`;
  }
  fragment.appendChild(cell);
}

function getPatternCoordFromViewport(vx, vy) {
  const layout = state.patternLayout;
  const metrics = patternZoom.getMetrics();
  if (!layout || !metrics.enabled || metrics.scale <= 0) return null;

  const contentX = (vx - metrics.viewportWidth / 2 - metrics.panX) / metrics.scale + metrics.contentWidth / 2;
  const contentY = (vy - metrics.viewportHeight / 2 - metrics.panY) / metrics.scale + metrics.contentHeight / 2;

  const localX = (contentX - layout.startX) / layout.cellSize;
  const localY = (contentY - layout.startY) / layout.cellSize;
  if (localX < 0 || localY < 0 || localX >= layout.gridSize || localY >= layout.gridSize) return null;

  return {
    x: Math.floor(localX) + 1,
    y: Math.floor(localY) + 1
  };
}

function renderPatternRulers() {
  clearPatternRulers();
  if (!state.grid || !state.patternLayout) return;

  const metrics = patternZoom.getMetrics();
  if (!metrics.enabled || !metrics.viewportWidth || !metrics.viewportHeight || metrics.scale <= 0) return;

  const layout = state.patternLayout;
  patternRulerTop.style.display = "block";
  patternRulerBottom.style.display = "block";
  patternRulerLeft.style.display = "block";
  patternRulerRight.style.display = "block";

  const topFragment = document.createDocumentFragment();
  const bottomFragment = document.createDocumentFragment();
  const leftFragment = document.createDocumentFragment();
  const rightFragment = document.createDocumentFragment();

  for (let i = 1; i <= layout.gridSize; i += 1) {
    const cellStartContentX = layout.startX + (i - 1) * layout.cellSize;
    const cellEndContentX = cellStartContentX + layout.cellSize;
    const cellStartContentY = layout.startY + (i - 1) * layout.cellSize;
    const cellEndContentY = cellStartContentY + layout.cellSize;

    const screenCellStartX =
      metrics.viewportWidth / 2 + metrics.panX + (cellStartContentX - metrics.contentWidth / 2) * metrics.scale;
    const screenCellEndX =
      metrics.viewportWidth / 2 + metrics.panX + (cellEndContentX - metrics.contentWidth / 2) * metrics.scale;

    const screenCellStartY =
      metrics.viewportHeight / 2 + metrics.panY + (cellStartContentY - metrics.contentHeight / 2) * metrics.scale;
    const screenCellEndY =
      metrics.viewportHeight / 2 + metrics.panY + (cellEndContentY - metrics.contentHeight / 2) * metrics.scale;

    const visibleXStart = Math.max(0, screenCellStartX);
    const visibleXEnd = Math.min(metrics.viewportWidth, screenCellEndX);
    const visibleYStart = Math.max(0, screenCellStartY);
    const visibleYEnd = Math.min(metrics.viewportHeight, screenCellEndY);

    if (visibleXEnd > visibleXStart) {
      addRulerCell(topFragment, i, visibleXStart, visibleXEnd - visibleXStart, "x");
      addRulerCell(bottomFragment, i, visibleXStart, visibleXEnd - visibleXStart, "x");
    }

    if (visibleYEnd > visibleYStart) {
      addRulerCell(leftFragment, i, visibleYStart, visibleYEnd - visibleYStart, "y");
      addRulerCell(rightFragment, i, visibleYStart, visibleYEnd - visibleYStart, "y");
    }
  }

  patternRulerTop.appendChild(topFragment);
  patternRulerBottom.appendChild(bottomFragment);
  patternRulerLeft.appendChild(leftFragment);
  patternRulerRight.appendChild(rightFragment);
}

function shouldShowCodes(forModal = false) {
  if (!hasCodeData()) return false;
  if (showCodesInput.checked) return true;
  const zoom = forModal ? modalZoom.getZoom() : patternZoom.getZoom();
  return zoom >= CODE_AUTO_ZOOM_THRESHOLD;
}

function renderPatternCanvas(updatePreview = false) {
  if (!state.grid) return;
  state.patternLayout = drawGrid(patternCanvas, state.grid, {
    gridLines: true,
    axisLabels: false,
    showCodes: shouldShowCodes(false),
    codeByHex: state.codeByHex,
    codeGrid: state.codeGrid
  });
  if (updatePreview) {
    setPreviewUrl("grid", buildGridPreviewDataUrl(state.grid));
    syncWorkflowPreviewUI();
  }
  renderPatternRulers();
}

function renderModalPattern() {
  if (!state.grid) return;
  drawGrid(zoomModalCanvas, state.grid, {
    gridLines: true,
    axisLabels: true,
    showCodes: shouldShowCodes(true),
    codeByHex: state.codeByHex,
    codeGrid: state.codeGrid
  });
}

function refreshReadyStatus() {
  if (!state.grid || !state.legend) return;
  const codesVisible = shouldShowCodes(false);
  const modeText = showCodesInput.checked
    ? " 色号已强制显示。"
    : codesVisible
      ? " 色号已自动显示（缩放触发）。"
      : " 放大后将自动显示色号。";
  setStatus(`已就绪。当前使用 ${state.legend.length} 种颜色。${modeText}`);
}

function syncMaxEdgeControls({ resetToMax = false } = {}) {
  const gridSize = getSafeGridSize(gridSizeSelect.value);
  const nextValue = resetToMax
    ? gridSize
    : clampNumber(maxEdgeSizeInput.value, 1, gridSize, gridSize);

  maxEdgeSizeRangeInput.max = String(gridSize);
  maxEdgeSizeInput.max = String(gridSize);
  maxEdgeSizeRangeInput.value = String(nextValue);
  maxEdgeSizeInput.value = String(nextValue);
}

function setMaxEdgeValue(rawValue) {
  const gridSize = getSafeGridSize(gridSizeSelect.value);
  const safeValue = clampNumber(rawValue, 1, gridSize, gridSize);
  maxEdgeSizeRangeInput.value = String(safeValue);
  maxEdgeSizeInput.value = String(safeValue);
}

function parseErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") return fallback;
  return payload.error || fallback;
}

function clearPatternOutput() {
  state.grid = null;
  state.legend = null;
  state.codeByHex = null;
  state.codeGrid = null;
  state.patternLayout = null;
  state.legendExpanded = false;
  resetGeneratedPreviewState();
  clearLegend();
  updateLegendToggle(0);
  setButtons(false);
  clearPatternRulers();
  patternCoordBadge.textContent = "X - / Y -";
  updateUploadFilename();
  updatePreviewEmptyState();
  refreshColorUsageStatus();
  syncWorkflowPreviewUI();

  const ctx = patternCanvas.getContext("2d");
  ctx.clearRect(0, 0, patternCanvas.width, patternCanvas.height);
  ctx.fillStyle = "#f2efe8";
  ctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
}

function clearWorkspace({ keepName = false } = {}) {
  generationId += 1;
  if (autoGenerateTimer) {
    clearTimeout(autoGenerateTimer);
    autoGenerateTimer = null;
  }
  closeZoomModal();
  closeExportModal();
  state.sourceFile = null;
  setPreviewUrl("source", "");
  clearPatternOutput();
  imageInput.value = "";
  if (!keepName) {
    state.workName = "";
    if (workNameInput) {
      workNameInput.value = "";
    }
  }
  updateUploadFilename();
  updatePreviewEmptyState();
  syncWorkflowPreviewUI();
  setGeneratingState(false);
}

function updateWorkRecord(workId, updater) {
  state.workLibrary = state.workLibrary.map((item) => (item.id === workId ? updater(item) : item));
  persistWorkLibrary();
  renderCreateWorksList();
  renderProfileView();
}

function prependWorkRecord(work) {
  state.workLibrary = [work, ...state.workLibrary].slice(0, 20);
  persistWorkLibrary();
  renderCreateWorksList();
  renderProfileView();
}

function renderCreateWorksList() {
  if (!createWorksList) return;
  if (!state.workLibrary.length) {
    createWorksList.innerHTML = `
      <section class="works-section-empty">
        <div class="works-empty-card">
          <div class="works-empty-title">还没有创作记录</div>
          <p class="works-empty-desc">上传一张图片后，这里会像小程序“创作”页一样记录原图、AI图和图纸。</p>
        </div>
      </section>
    `;
    return;
  }

  createWorksList.innerHTML = `
    <section class="works-section">
      <div class="works-section-head">
        <h2>创作</h2>
        <p>和小程序一致展示最近作品、预览链路与图纸状态。</p>
      </div>
      <div class="works-list">
        ${state.workLibrary.map((item) => `
          <article class="work-card">
            <div class="work-title-row">
              <button class="work-title-editable" type="button" data-action="rename-work" data-work-id="${item.id}">
                <span class="work-title">${escapeHtml(item.title)}</span>
                <span class="work-title-edit-icon">✎</span>
              </button>
              <span class="work-status ${item.isGenerating ? "is-generating" : ""} ${item.isFailed ? "is-failed" : ""}">${item.status}</span>
            </div>

            <div class="preview-row">
              ${["origin", "ai", "grid"].map((type) => {
                const label = type === "origin" ? "原图" : type === "grid" ? "图纸" : (String(item.style || "").includes("Q版") ? "Q版图" : "AI图");
                const preview = item.previewImages && item.previewImages[type] ? item.previewImages[type] : "";
                const pixel = type === "grid" || (type === "ai" && !String(item.style || "").includes("Q版"));
                return `
                  <button
                    class="preview-block ${type === "grid" ? "preview-block-grid" : ""} preview-tone-${type === "origin" ? "origin-a" : type === "ai" ? "ai-a" : "grid-a"}"
                    type="button"
                    data-action="preview-work"
                    data-work-id="${item.id}"
                    data-view-type="${type}"
                  >
                    ${preview ? `<img class="preview-image ${pixel ? "preview-image-pixel" : ""}" src="${preview}" alt="${label}" />` : `<div class="preview-placeholder">${label}</div>`}
                    <div class="preview-label">${label}</div>
                  </button>
                `;
              }).join("")}
            </div>

            <div class="work-meta">${escapeHtml(item.size)} · ${escapeHtml(item.style)}</div>
            ${item.failReason ? `<div class="creator-reason">${escapeHtml(item.failReason)}</div>` : ""}
            <div class="work-stats">
              <span>浏览 ${item.views || 0}</span>
              <span>收藏 ${item.saves || 0}</span>
              <span>复用 ${item.clones || 0}</span>
              ${item.beadEstimate ? `<span>豆量 ${item.beadEstimate.total || 0}</span>` : ""}
              ${item.beadEstimate ? `<span>色数 ${item.beadEstimate.colorUsed || 0}</span>` : ""}
            </div>
            <div class="work-footer">
              <span class="work-date">${escapeHtml(item.date || formatRelativeTime(item.createdAt))}</span>
              <div class="work-footer-actions">
                <button class="footer-sheet-btn" type="button" data-action="preview-work" data-work-id="${item.id}" data-view-type="grid">色号图纸</button>
                <button class="footer-delete-btn" type="button" data-action="delete-work" data-work-id="${item.id}">×</button>
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderProfileView() {
  if (!profileView) return;
  const summary = state.workLibrary.reduce((acc, item) => {
    if (item.status === "已完成") acc.works += 1;
    acc.likes += Number(item.views) || 0;
    acc.saves += Number(item.saves) || 0;
    acc.clones += Number(item.clones) || 0;
    return acc;
  }, { works: 0, likes: 0, saves: 0, clones: 0 });

  profileView.innerHTML = `
    <div class="page profile-page">
      <section class="summary-card">
        <div class="summary-main">
          <div class="avatar">豆</div>
          <div class="summary-meta">
            <div class="name-row">
              <span class="nickname">未设置昵称</span>
              <span class="bean-text">豆币:12</span>
            </div>
            <div class="reuse-text">作品总复用：${summary.clones} 次</div>
          </div>
        </div>
        <div class="quick-row">
          <button class="quick-item" type="button" data-profile-action="favorites">
            <span class="quick-icon">藏</span>
            <span>我的收藏</span>
          </button>
          <button class="quick-item" type="button" data-profile-action="records">
            <span class="quick-icon">记</span>
            <span>生成记录</span>
          </button>
        </div>
      </section>

      <section class="account-card">
        <div class="account-row">
          <span class="account-label">账号ID：</span>
          <span class="account-value">${escapeHtml(state.accountId)}</span>
          <button class="copy-btn" type="button" data-profile-action="copy-account">复制</button>
        </div>
        <div class="account-row">
          <span class="account-label">豆币余额：</span>
          <span class="account-value">12拼豆币</span>
        </div>
      </section>

      <section class="stats-card">
        <div class="stat-item"><span class="stat-value">${summary.works}</span><span class="stat-label">完成作品</span></div>
        <div class="stat-item"><span class="stat-value">${summary.likes}</span><span class="stat-label">获赞</span></div>
        <div class="stat-item"><span class="stat-value">${summary.saves}</span><span class="stat-label">被收藏</span></div>
        <div class="stat-item"><span class="stat-value">${summary.clones}</span><span class="stat-label">复用</span></div>
      </section>

      <section class="menu-card">
        ${["豆币明细", "获赞与收藏", "导出记录", "账号设置"].map((title) => `
          <button class="menu-item" type="button" data-profile-action="coming-soon">
            <span>${title}</span>
            <span class="arrow">›</span>
          </button>
        `).join("")}
      </section>

      <button class="contact-btn" type="button" data-profile-action="contact">联系客服</button>
    </div>
  `;
}

function renderSquareView() {
  if (!squareView) return;
  const square = state.square;
  squareView.innerHTML = `
    <div class="page square-page">
      <section class="square-top-nav">
        <div class="main-nav-row">
          <div class="main-nav-list">
            ${square.mainNavs.map((item) => `
              <button class="main-nav-item ${square.activeMainNav === item.id ? "is-active" : ""}" type="button" data-square-action="main-nav" data-id="${item.id}">
                ${escapeHtml(item.label)}
              </button>
            `).join("")}
          </div>
          <button class="search-entry" type="button" data-square-action="open-search">🔍</button>
        </div>

        <div class="sort-row">
          <div class="sort-list">
            ${square.sortNavs.map((item) => `
              <button class="sort-item ${square.activeSortNav === item.id ? "is-active" : ""}" type="button" data-square-action="sort-nav" data-id="${item.id}">
                ${escapeHtml(item.label)}
              </button>
            `).join("")}
          </div>
          <button class="sort-filter-icon" type="button" data-square-action="filter-hint">⚲</button>
        </div>

        <div class="tag-row">
          <div class="tag-list">
            ${square.activeTagOptions.map((tag) => `
              <button class="tag-chip ${square.activeTag === tag ? "is-active" : ""}" type="button" data-square-action="tag" data-tag="${escapeHtml(tag)}">
                ${escapeHtml(tag)}
              </button>
            `).join("")}
          </div>
        </div>

        ${square.searchKeyword ? `
          <div class="search-state">
            <span>关键词：${escapeHtml(square.searchKeyword)}</span>
            <button class="clear-link" type="button" data-square-action="clear-search">清除</button>
          </div>
        ` : ""}
      </section>

      <section class="paper-grid">
        ${square.displayPapers.map((item) => `
          <article class="paper-card">
            <button class="paper-cover tone-${item.tone}" type="button" data-square-action="preview-paper" data-id="${item.id}">
              ${item.hot ? '<span class="hot-tag">热门</span>' : ""}
              <span class="paper-pixel"><span class="paper-pixel-text">${escapeHtml(item.theme)}</span></span>
            </button>
            <div class="paper-title">${escapeHtml(item.title)}</div>
            <div class="paper-author-row">
              <span class="author-avatar">${escapeHtml(item.avatarText)}</span>
              <span class="author-name">${escapeHtml(item.author)}</span>
              <span class="paper-size">${escapeHtml(item.size)}</span>
            </div>
            <div class="paper-meta-row">
              <span class="meta-tag">${escapeHtml(item.scene)}</span>
              <span class="meta-tag">${escapeHtml(item.difficulty)}</span>
            </div>
            <div class="paper-action-row">
              <span class="mini-btn metric-btn">♡ ${item.likes}</span>
              <span class="mini-btn metric-btn">☆ ${item.favorites}</span>
              <button class="mini-btn export-btn" type="button" data-square-action="export-paper" data-id="${item.id}">⬇</button>
              <button class="mini-btn edit-btn" type="button" data-square-action="edit-paper" data-id="${item.id}">✎</button>
            </div>
          </article>
        `).join("")}
      </section>

      ${square.displayPapers.length ? "" : '<div class="empty-block">暂无匹配图纸，试试切换筛选条件</div>'}

      <button class="square-generate-btn" type="button" data-square-action="generate">AI生成图纸</button>

      ${square.showSearchPanel ? `
        <div class="square-overlay">
          <div class="search-modal">
            <div class="search-modal-title">搜索图纸</div>
            <div class="search-modal-row">
              <input id="squareSearchInput" class="search-modal-input" placeholder="输入图案、场景或作者" value="${escapeHtml(square.searchDraft)}" />
              <button class="search-modal-btn" type="button" data-square-action="confirm-search">搜索</button>
            </div>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function setCurrentView(view) {
  state.currentView = view;
  if (squareView) squareView.classList.toggle("is-active", view === "square");
  if (createView) createView.classList.toggle("is-active", view === "create");
  if (profileView) profileView.classList.toggle("is-active", view === "profile");
  siteTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
}

function scheduleAutoGenerate(delay = 280) {
  if (!state.sourceFile || !cropModal.hidden) return;
  if (autoGenerateTimer) {
    clearTimeout(autoGenerateTimer);
  }
  autoGenerateTimer = window.setTimeout(() => {
    autoGenerateTimer = null;
    generatePattern();
  }, delay);
}

function getCropRatioFromMode(mode) {
  if (mode === "custom") return null;
  if (mode === "original") {
    if (!cropState.image) return null;
    return cropState.image.naturalWidth / cropState.image.naturalHeight;
  }
  if (mode === "1:1") return 1;
  if (mode === "3:4") return 3 / 4;
  if (mode === "4:3") return 4 / 3;
  return null;
}

function updateCropModeButtons() {
  cropModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.cropMode === cropState.mode);
  });
}

function getCropImageScale() {
  return cropState.baseScale * cropState.zoom;
}

function getCropImageRect() {
  const scale = getCropImageScale();
  const width = cropState.image.naturalWidth * scale;
  const height = cropState.image.naturalHeight * scale;
  return {
    x: cropState.centerX - width / 2,
    y: cropState.centerY - height / 2,
    w: width,
    h: height
  };
}

function getCropPointFromEvent(event) {
  const rect = cropCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (cropState.viewWidth / rect.width),
    y: (event.clientY - rect.top) * (cropState.viewHeight / rect.height)
  };
}

function fitSizeToRatio(maxW, maxH, ratio) {
  if (!ratio) {
    return { w: maxW, h: maxH };
  }

  if (maxW / maxH > ratio) {
    return { w: maxH * ratio, h: maxH };
  }
  return { w: maxW, h: maxW / ratio };
}

function constrainCropRectToImage() {
  if (!cropState.image) return;
  const imageRect = getCropImageRect();
  const rect = cropState.cropRect;

  if (cropState.ratioLocked && cropState.ratio) {
    const ratio = cropState.ratio;
    const maxByHeight = imageRect.h * ratio;
    let maxW = Math.min(imageRect.w, maxByHeight);

    if (maxW < CROP_MIN_SIZE) {
      maxW = Math.max(4, maxW);
    }

    rect.w = clamp(rect.w, CROP_MIN_SIZE, maxW);
    rect.h = rect.w / ratio;

    if (rect.h > imageRect.h) {
      rect.h = imageRect.h;
      rect.w = rect.h * ratio;
    }

    rect.x = clamp(rect.x, imageRect.x, imageRect.x + imageRect.w - rect.w);
    rect.y = clamp(rect.y, imageRect.y, imageRect.y + imageRect.h - rect.h);
    return;
  }

  rect.w = clamp(rect.w, CROP_MIN_SIZE, imageRect.w);
  rect.h = clamp(rect.h, CROP_MIN_SIZE, imageRect.h);
  rect.x = clamp(rect.x, imageRect.x, imageRect.x + imageRect.w - rect.w);
  rect.y = clamp(rect.y, imageRect.y, imageRect.y + imageRect.h - rect.h);
}

function clampImageCenterToCoverCrop() {
  if (!cropState.image) return;
  const imageRect = getCropImageRect();
  const rect = cropState.cropRect;

  const minCenterX = rect.x + rect.w - imageRect.w / 2;
  const maxCenterX = rect.x + imageRect.w / 2;
  const minCenterY = rect.y + rect.h - imageRect.h / 2;
  const maxCenterY = rect.y + imageRect.h / 2;

  if (minCenterX <= maxCenterX) {
    cropState.centerX = clamp(cropState.centerX, minCenterX, maxCenterX);
  }
  if (minCenterY <= maxCenterY) {
    cropState.centerY = clamp(cropState.centerY, minCenterY, maxCenterY);
  }
}

function getDynamicCropMinZoom() {
  if (!cropState.image) return cropState.minZoom;
  const requiredZoomX = cropState.cropRect.w / (cropState.image.naturalWidth * cropState.baseScale);
  const requiredZoomY = cropState.cropRect.h / (cropState.image.naturalHeight * cropState.baseScale);
  return Math.max(0.2, requiredZoomX, requiredZoomY);
}

function setCropZoom(nextZoom, anchorX = cropState.viewWidth / 2, anchorY = cropState.viewHeight / 2) {
  if (!cropState.image) return;

  const currentScale = getCropImageScale();
  const minZoom = getDynamicCropMinZoom();
  cropState.zoom = clamp(nextZoom, minZoom, cropState.maxZoom);

  const nextScale = getCropImageScale();
  const imageCoordX = (anchorX - cropState.centerX) / currentScale;
  const imageCoordY = (anchorY - cropState.centerY) / currentScale;

  cropState.centerX = anchorX - imageCoordX * nextScale;
  cropState.centerY = anchorY - imageCoordY * nextScale;

  clampImageCenterToCoverCrop();
  renderCropCanvas();
}

function initializeCropRectForMode() {
  const imageRect = getCropImageRect();
  const ratio = cropState.ratio;
  const margin = Math.min(imageRect.w, imageRect.h) * CROP_MARGIN_RATIO;
  const maxW = Math.max(40, imageRect.w - margin * 2);
  const maxH = Math.max(40, imageRect.h - margin * 2);
  const fit = fitSizeToRatio(maxW, maxH, ratio);

  cropState.cropRect = {
    x: imageRect.x + (imageRect.w - fit.w) / 2,
    y: imageRect.y + (imageRect.h - fit.h) / 2,
    w: fit.w,
    h: fit.h
  };

  constrainCropRectToImage();
}

function adaptCropRectToMode() {
  const imageRect = getCropImageRect();
  const rect = cropState.cropRect;

  if (!cropState.ratioLocked || !cropState.ratio) {
    constrainCropRectToImage();
    return;
  }

  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const area = Math.max(rect.w * rect.h, CROP_MIN_SIZE * CROP_MIN_SIZE);
  const targetW = Math.sqrt(area * cropState.ratio);
  const targetH = targetW / cropState.ratio;
  const fitScale = Math.min(1, imageRect.w / targetW, imageRect.h / targetH);

  rect.w = targetW * fitScale;
  rect.h = targetH * fitScale;
  rect.x = centerX - rect.w / 2;
  rect.y = centerY - rect.h / 2;

  constrainCropRectToImage();
}

function setCropMode(mode, { initialize = false } = {}) {
  cropState.mode = mode;
  cropState.ratio = getCropRatioFromMode(mode);
  cropState.ratioLocked = cropState.ratio !== null;
  updateCropModeButtons();

  if (initialize) {
    initializeCropRectForMode();
  } else {
    adaptCropRectToMode();
  }

  renderCropCanvas();
}

function resizeCropCanvas() {
  const rect = cropCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  cropState.viewWidth = rect.width;
  cropState.viewHeight = rect.height;
  cropState.dpr = window.devicePixelRatio || 1;

  cropCanvas.width = Math.round(rect.width * cropState.dpr);
  cropCanvas.height = Math.round(rect.height * cropState.dpr);
}

function resetCropView() {
  if (!cropState.image) return;

  cropState.baseScale = Math.min(
    cropState.viewWidth / cropState.image.naturalWidth,
    cropState.viewHeight / cropState.image.naturalHeight
  );
  cropState.zoom = 1;
  cropState.centerX = cropState.viewWidth / 2;
  cropState.centerY = cropState.viewHeight / 2;

  initializeCropRectForMode();
}

function renderCropCanvas() {
  const image = cropState.image;
  if (!image || !cropState.viewWidth || !cropState.viewHeight) return;

  const ctx = cropCanvas.getContext("2d");
  ctx.setTransform(cropState.dpr, 0, 0, cropState.dpr, 0, 0);
  ctx.clearRect(0, 0, cropState.viewWidth, cropState.viewHeight);

  const imageRect = getCropImageRect();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, imageRect.x, imageRect.y, imageRect.w, imageRect.h);

  const rect = cropState.cropRect;

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.fillRect(0, 0, cropState.viewWidth, rect.y);
  ctx.fillRect(0, rect.y, rect.x, rect.h);
  ctx.fillRect(rect.x + rect.w, rect.y, cropState.viewWidth - (rect.x + rect.w), rect.h);
  ctx.fillRect(0, rect.y + rect.h, cropState.viewWidth, cropState.viewHeight - (rect.y + rect.h));

  ctx.strokeStyle = "#ff7a00";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w / 3, rect.y);
  ctx.lineTo(rect.x + rect.w / 3, rect.y + rect.h);
  ctx.moveTo(rect.x + (rect.w * 2) / 3, rect.y);
  ctx.lineTo(rect.x + (rect.w * 2) / 3, rect.y + rect.h);
  ctx.moveTo(rect.x, rect.y + rect.h / 3);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 3);
  ctx.moveTo(rect.x, rect.y + (rect.h * 2) / 3);
  ctx.lineTo(rect.x + rect.w, rect.y + (rect.h * 2) / 3);
  ctx.stroke();
  ctx.setLineDash([]);

  const handles = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h]
  ];

  if (!cropState.ratioLocked) {
    handles.push(
      [rect.x + rect.w / 2, rect.y],
      [rect.x + rect.w / 2, rect.y + rect.h],
      [rect.x, rect.y + rect.h / 2],
      [rect.x + rect.w, rect.y + rect.h / 2]
    );
  }

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ff7a00";
  handles.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.rect(x - 5, y - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  });
}

function pointInRect(x, y, rect) {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
}

function getCropHandleAtPoint(x, y) {
  const r = cropState.cropRect;
  const threshold = CROP_HANDLE_SIZE;

  const corners = [
    { name: "nw", x: r.x, y: r.y, cursor: "nwse-resize" },
    { name: "ne", x: r.x + r.w, y: r.y, cursor: "nesw-resize" },
    { name: "sw", x: r.x, y: r.y + r.h, cursor: "nesw-resize" },
    { name: "se", x: r.x + r.w, y: r.y + r.h, cursor: "nwse-resize" }
  ];

  for (const corner of corners) {
    if (Math.abs(x - corner.x) <= threshold && Math.abs(y - corner.y) <= threshold) {
      return corner;
    }
  }

  if (cropState.ratioLocked) return null;

  const edges = [
    { name: "n", cursor: "ns-resize", hit: x >= r.x && x <= r.x + r.w && Math.abs(y - r.y) <= threshold },
    { name: "s", cursor: "ns-resize", hit: x >= r.x && x <= r.x + r.w && Math.abs(y - (r.y + r.h)) <= threshold },
    { name: "w", cursor: "ew-resize", hit: y >= r.y && y <= r.y + r.h && Math.abs(x - r.x) <= threshold },
    { name: "e", cursor: "ew-resize", hit: y >= r.y && y <= r.y + r.h && Math.abs(x - (r.x + r.w)) <= threshold }
  ];

  return edges.find((edge) => edge.hit) || null;
}

function updateCropCursor(point) {
  if (!cropState.image) {
    cropCanvas.style.cursor = "default";
    return;
  }

  const handle = getCropHandleAtPoint(point.x, point.y);
  if (handle) {
    cropCanvas.style.cursor = handle.cursor;
    return;
  }

  if (pointInRect(point.x, point.y, cropState.cropRect)) {
    cropCanvas.style.cursor = "move";
    return;
  }

  const imageRect = getCropImageRect();
  if (pointInRect(point.x, point.y, imageRect)) {
    cropCanvas.style.cursor = "grab";
    return;
  }

  cropCanvas.style.cursor = "default";
}

function applyCropResize(handleName, dx, dy) {
  const start = cropState.interaction.startRect;
  const rect = cropState.cropRect;

  if (cropState.ratioLocked && cropState.ratio) {
    const ratio = cropState.ratio;

    if (handleName === "se") {
      rect.w = start.w + dx;
      rect.h = rect.w / ratio;
      rect.x = start.x;
      rect.y = start.y;
    } else if (handleName === "sw") {
      rect.w = start.w - dx;
      rect.h = rect.w / ratio;
      rect.x = start.x + (start.w - rect.w);
      rect.y = start.y;
    } else if (handleName === "ne") {
      rect.w = start.w + dx;
      rect.h = rect.w / ratio;
      rect.x = start.x;
      rect.y = start.y + (start.h - rect.h);
    } else if (handleName === "nw") {
      rect.w = start.w - dx;
      rect.h = rect.w / ratio;
      rect.x = start.x + (start.w - rect.w);
      rect.y = start.y + (start.h - rect.h);
    }

    constrainCropRectToImage();
    return;
  }

  rect.x = start.x;
  rect.y = start.y;
  rect.w = start.w;
  rect.h = start.h;

  if (handleName.includes("e")) {
    rect.w = start.w + dx;
  }
  if (handleName.includes("s")) {
    rect.h = start.h + dy;
  }
  if (handleName.includes("w")) {
    rect.w = start.w - dx;
    rect.x = start.x + dx;
  }
  if (handleName.includes("n")) {
    rect.h = start.h - dy;
    rect.y = start.y + dy;
  }

  constrainCropRectToImage();
}

function applyCropMove(dx, dy) {
  const start = cropState.interaction.startRect;
  cropState.cropRect.x = start.x + dx;
  cropState.cropRect.y = start.y + dy;
  constrainCropRectToImage();
}

function applyImagePan(dx, dy) {
  cropState.centerX = cropState.interaction.startCenterX + dx;
  cropState.centerY = cropState.interaction.startCenterY + dy;
  clampImageCenterToCoverCrop();
}

function getCropPointerDistance() {
  const points = Array.from(cropState.activePointers.values());
  if (points.length < 2) return 0;
  const [a, b] = points;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function getCropPointerCenter() {
  const points = Array.from(cropState.activePointers.values());
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => {
    acc.x += p.x;
    acc.y += p.y;
    return acc;
  }, { x: 0, y: 0 });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

function startCropInteraction(event) {
  if (!cropState.image || event.button !== 0) return;

  const point = getCropPointFromEvent(event);
  cropState.activePointers.set(event.pointerId, point);
  if (typeof cropCanvas.setPointerCapture === "function") {
    try {
      cropCanvas.setPointerCapture(event.pointerId);
    } catch (_err) {
      // no-op
    }
  }

  if (cropState.activePointers.size >= 2) {
    const distance = getCropPointerDistance();
    if (distance > 0) {
      cropState.pinch = {
        startDistance: distance,
        startZoom: cropState.zoom
      };
      cropState.suppressClick = true;
    }
    cropState.interaction = null;
    return;
  }

  const handle = getCropHandleAtPoint(point.x, point.y);

  cropState.interaction = {
    kind: null,
    handle: handle ? handle.name : null,
    startX: point.x,
    startY: point.y,
    startRect: { ...cropState.cropRect },
    startCenterX: cropState.centerX,
    startCenterY: cropState.centerY
  };

  if (handle) {
    cropState.interaction.kind = "resize";
  } else if (pointInRect(point.x, point.y, cropState.cropRect)) {
    cropState.interaction.kind = "move";
  } else {
    const imageRect = getCropImageRect();
    if (pointInRect(point.x, point.y, imageRect)) {
      cropState.interaction.kind = "pan";
      cropCanvas.style.cursor = "grabbing";
    }
  }

  if (!cropState.interaction.kind) {
    cropState.interaction = null;
    return;
  }
}

function moveCropInteraction(event) {
  if (!cropState.image) return;

  const point = getCropPointFromEvent(event);
  if (cropState.activePointers.has(event.pointerId)) {
    cropState.activePointers.set(event.pointerId, point);
  }

  if (cropState.pinch && cropState.activePointers.size >= 2) {
    const distance = getCropPointerDistance();
    const center = getCropPointerCenter();
    if (distance > 0 && cropState.pinch.startDistance > 0 && center) {
      const ratio = distance / cropState.pinch.startDistance;
      setCropZoom(cropState.pinch.startZoom * ratio, center.x, center.y);
    }
    return;
  }

  if (!cropState.interaction) {
    updateCropCursor(point);
    return;
  }
  const dx = point.x - cropState.interaction.startX;
  const dy = point.y - cropState.interaction.startY;

  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    cropState.suppressClick = true;
  }

  if (cropState.interaction.kind === "move") {
    applyCropMove(dx, dy);
  } else if (cropState.interaction.kind === "resize") {
    applyCropResize(cropState.interaction.handle, dx, dy);
  } else if (cropState.interaction.kind === "pan") {
    applyImagePan(dx, dy);
  }

  renderCropCanvas();
}

function endCropInteraction(event) {
  if (cropState.activePointers.has(event.pointerId)) {
    cropState.activePointers.delete(event.pointerId);
  }

  if (cropState.pinch && cropState.activePointers.size < 2) {
    cropState.pinch = null;
  }

  try {
    cropCanvas.releasePointerCapture(event.pointerId);
  } catch (_err) {
    // no-op
  }

  cropState.interaction = null;
  if (cropState.suppressClick) {
    window.setTimeout(() => {
      cropState.suppressClick = false;
    }, 0);
  }
}

function cleanupCropImage() {
  cropState.image = null;
  cropState.file = null;
  cropState.interaction = null;
  cropState.pinch = null;
  cropState.activePointers.clear();
  cropCanvas.style.cursor = "default";

  if (cropState.imageUrl) {
    URL.revokeObjectURL(cropState.imageUrl);
    cropState.imageUrl = null;
  }
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = url;
  });
}

async function openCropModal(file) {
  closeZoomModal();
  cleanupCropImage();

  const url = URL.createObjectURL(file);
  let image;
  try {
    image = await loadImageFromUrl(url);
  } catch (_err) {
    URL.revokeObjectURL(url);
    setStatus("无法打开图片进行裁剪。");
    return;
  }

  cropState.file = file;
  cropState.image = image;
  cropState.imageUrl = url;

  cropModal.hidden = false;
  syncBodyModalState();
  setStatus("请调整裁剪区域，然后点击“应用裁剪”。");

  resizeCropCanvas();
  resetCropView();
  setCropMode("custom", { initialize: true });
}

function closeCropModal() {
  cropModal.hidden = true;
  syncBodyModalState();
  cleanupCropImage();
  imageInput.value = "";
  updateUploadFilename();
}

async function buildCroppedFile() {
  if (!cropState.image || !cropState.file) return null;

  const imageRect = getCropImageRect();
  const scale = getCropImageScale();
  const rect = cropState.cropRect;

  const sx = clamp((rect.x - imageRect.x) / scale, 0, cropState.image.naturalWidth);
  const sy = clamp((rect.y - imageRect.y) / scale, 0, cropState.image.naturalHeight);
  const sw = clamp(rect.w / scale, 1, cropState.image.naturalWidth - sx);
  const sh = clamp(rect.h / scale, 1, cropState.image.naturalHeight - sy);

  const outputWidth = Math.max(1, Math.round(sw));
  const outputHeight = Math.max(1, Math.round(sh));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cropState.image, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

  const mime = cropState.file.type && cropState.file.type.startsWith("image/")
    ? cropState.file.type
    : "image/png";

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, 0.95);
  });

  if (!blob) return null;

  return new File([blob], cropState.file.name, {
    type: blob.type || mime,
    lastModified: Date.now()
  });
}

async function buildFileFromUrl(url, filename = "stylized.png") {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("stylized-download-failed");
  }
  const blob = await res.blob();
  return new File([blob], filename, {
    type: blob.type || "image/png",
    lastModified: Date.now()
  });
}

async function ensureStylizedGenerationFile(sourceFile) {
  const styleMode = getCurrentStyleMode();
  if (styleMode !== STYLE_MODE_CARTOON) {
    setPreviewUrl("stylized", "");
    state.generatedStylizedFile = null;
    state.stylizedSourceFingerprint = "";
    syncWorkflowPreviewUI();
    return sourceFile;
  }

  const fingerprint = buildSourceFingerprint(sourceFile);
  if (
    state.generatedStylizedFile
    && state.stylizedSourceFingerprint
    && state.stylizedSourceFingerprint === fingerprint
  ) {
    return state.generatedStylizedFile;
  }

  setPreviewUrl("stylized", "");
  syncWorkflowPreviewUI();
  setStatus("正在生成Q版中间稿...");

  const formData = new FormData();
  formData.append("image", sourceFile);
  formData.append("maxEdge", maxEdgeSizeInput.value);
  formData.append("style", "q-version");
  formData.append("mode", "cartoon");
  formData.append("prompt", `请将图片转换为Q版卡通风格，保留主体识别度与主色，方便后续像素化。作品名：${getEffectiveWorkName()}`);

  const res = await fetch("/api/q-cartoonize", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    throw new Error("q-cartoonize-failed");
  }

  const payload = await res.json();
  const outputUrl = String(
    payload.imagePath
    || payload.stylizedImagePath
    || payload.outputImagePath
    || payload.url
    || ""
  );
  if (!outputUrl) {
    throw new Error("q-cartoonize-empty");
  }

  const stylizedFile = await buildFileFromUrl(outputUrl, `${getEffectiveWorkName()}-q版.png`);
  state.generatedStylizedFile = stylizedFile;
  state.stylizedSourceFingerprint = fingerprint;
  setPreviewUrl("stylized", outputUrl);
  syncWorkflowPreviewUI();
  return stylizedFile;
}

function buildPendingWorkRecord() {
  const workId = `w-${Date.now()}`;
  return {
    id: workId,
    title: getEffectiveWorkName(),
    date: "刚刚",
    createdAt: Date.now(),
    size: "转换中",
    style: getCurrentStyleMode() === STYLE_MODE_CARTOON ? "卡通像素（Q版）" : "精致像素",
    status: "转换中",
    isGenerating: true,
    isFailed: false,
    failReason: "",
    views: 0,
    saves: 0,
    clones: 0,
    previewImages: {
      origin: state.sourcePreviewUrl,
      ai: "",
      grid: ""
    },
    beadEstimate: null
  };
}

async function generatePattern(fileOverride = null) {
  if (autoGenerateTimer) {
    clearTimeout(autoGenerateTimer);
    autoGenerateTimer = null;
  }

  const file = fileOverride || state.sourceFile;
  if (!file) {
    setStatus("请先选择图片并完成裁剪。");
    return;
  }

  const runId = ++generationId;
  state.workName = getEffectiveWorkName();
  if (workNameInput) {
    workNameInput.value = state.workName;
  }
  const pendingWork = buildPendingWorkRecord();
  prependWorkRecord(pendingWork);
  setGeneratingState(true);
  setPreviewUrl("grid", "");
  if (getCurrentStyleMode() !== STYLE_MODE_CARTOON) {
    setPreviewUrl("stylized", "");
  }
  syncWorkflowPreviewUI();
  setStatus(getCurrentStyleMode() === STYLE_MODE_CARTOON ? "正在准备Q版图纸..." : "正在生成图纸...");
  setButtons(false);

  try {
    const generationFile = await ensureStylizedGenerationFile(file);
    if (runId !== generationId) {
      return;
    }
    if (state.stylizedPreviewUrl) {
      updateWorkRecord(pendingWork.id, (item) => ({
        ...item,
        previewImages: {
          ...item.previewImages,
          ai: state.stylizedPreviewUrl
        }
      }));
    }

    const formData = new FormData();
    formData.append("image", generationFile, generationFile.name || `${state.workName}.png`);
    formData.append("gridSize", String(getSafeGridSize(gridSizeSelect.value)));
    formData.append("maxEdgeSize", maxEdgeSizeInput.value);
    formData.append("maxColors", FIXED_MAX_COLORS);
    formData.append("paletteId", paletteSelect.value);
    formData.append("mappingStrategy", FIXED_MAPPING_STRATEGY);
    formData.append("preprocessMode", FIXED_PREPROCESS_MODE);
    formData.append("samplingMode", samplingModeSelect.value);
    formData.append("alpha", FIXED_ALPHA);
    formData.append("beta", FIXED_BETA);
    formData.append("optimize", optimizeInput.checked ? "true" : "false");

    if (getCurrentStyleMode() === STYLE_MODE_CARTOON) {
      setStatus("Q版中间稿已完成，正在生成拼豆图纸...");
    } else {
      setStatus("正在生成拼豆图纸...");
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      body: formData
    });

    if (runId !== generationId) {
      return;
    }

    if (!res.ok) {
      let errorPayload = null;
      try {
        errorPayload = await res.json();
      } catch (_err) {
        errorPayload = null;
      }
      setStatus(parseErrorMessage(errorPayload, "图纸生成失败。"));
      setButtons(Boolean(state.grid));
      updatePreviewEmptyState();
      return;
    }

    const data = await res.json();
    state.grid = data.grid;
    state.legend = data.legend;
    state.gridSize = data.gridSize;
    state.codeByHex = data.codeByHex || null;
    state.codeGrid = data.codeGrid || null;
    state.legendExpanded = false;
    if (getCurrentStyleMode() !== STYLE_MODE_CARTOON) {
      setPreviewUrl("stylized", buildPixelPreviewDataUrl(state.grid));
    }
    updatePreviewEmptyState();

    renderPatternCanvas();
    renderLegend(state.legend);
    refreshColorUsageStatus();
    refreshReadyStatus();
    renderExportPreview();
    setButtons(true);
    syncWorkflowPreviewUI();
    updateWorkRecord(pendingWork.id, (item) => ({
      ...item,
      title: state.workName,
      date: "刚刚",
      size: `${data.gridSize}x${data.gridSize}`,
      status: "已完成",
      isGenerating: false,
      previewImages: {
        origin: state.sourcePreviewUrl,
        ai: state.stylizedPreviewUrl,
        grid: state.gridPreviewUrl
      },
      beadEstimate: {
        total: data.gridSize * data.gridSize,
        colorUsed: Array.isArray(data.legend) ? data.legend.length : 0
      }
    }));

    if (!zoomModal.hidden) {
      renderModalPattern();
    }
  } catch (error) {
    if (runId !== generationId) return;
    const message = error && error.message === "q-cartoonize-failed"
      ? "Q版中间稿生成失败，请稍后重试。"
      : "图纸生成失败。";
    setStatus(message);
    updateWorkRecord(pendingWork.id, (item) => ({
      ...item,
      status: "转换失败",
      isGenerating: false,
      isFailed: true,
      failReason: message,
      size: "-"
    }));
    setButtons(Boolean(state.grid));
    updatePreviewEmptyState();
    refreshColorUsageStatus();
    renderExportPreview();
  } finally {
    if (runId === generationId) {
      setGeneratingState(false);
      syncWorkflowPreviewUI();
    }
  }
}

function openPatternModal() {
  if (!state.grid) return;
  zoomModalTitle.textContent = `${getEffectiveWorkName()} · 图纸（放大）`;
  zoomModalCanvas.hidden = false;
  zoomModalCanvas.style.display = "";
  renderModalPattern();

  zoomModal.hidden = false;
  syncBodyModalState();

  window.requestAnimationFrame(() => {
    modalZoom.setContent(zoomModalCanvas, zoomModalCanvas.width, zoomModalCanvas.height);
  });
}

function closeZoomModal() {
  if (zoomModal.hidden) return;
  zoomModal.hidden = true;
  zoomModalCanvas.hidden = true;
  zoomModalCanvas.style.display = "none";
  modalZoom.clear();
  syncBodyModalState();
}

async function loadPalettes() {
  const res = await fetch("/api/palettes");
  const data = await res.json();

  paletteSelect.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "auto";
  autoOption.textContent = "自动（K-Means）";
  paletteSelect.appendChild(autoOption);

  data.palettes.forEach((palette) => {
    const option = document.createElement("option");
    option.value = palette.id;
    option.textContent = palette.name;
    paletteSelect.appendChild(option);
  });

  if (data.palettes.some((palette) => palette.id === "mard-221")) {
    paletteSelect.value = "mard-221";
  }
  refreshColorUsageStatus();
}

showCodesInput.addEventListener("change", () => {
  if (!state.grid) return;
  renderPatternCanvas();
  if (!zoomModal.hidden) {
    renderModalPattern();
  }
  if (exportModal && !exportModal.hidden) {
    renderExportPreview();
  }
  refreshReadyStatus();
});

gridSizeSelect.addEventListener("change", () => {
  syncMaxEdgeControls({ resetToMax: true });
  scheduleAutoGenerate(180);
});

maxEdgeSizeRangeInput.addEventListener("input", () => {
  setMaxEdgeValue(maxEdgeSizeRangeInput.value);
  scheduleAutoGenerate(220);
});

maxEdgeSizeInput.addEventListener("input", () => {
  setMaxEdgeValue(maxEdgeSizeInput.value);
  scheduleAutoGenerate(220);
});

paletteSelect.addEventListener("change", () => {
  refreshColorUsageStatus();
  scheduleAutoGenerate(200);
});

samplingModeSelect.addEventListener("change", () => {
  scheduleAutoGenerate(200);
});

optimizeInput.addEventListener("change", () => {
  scheduleAutoGenerate(200);
});

if (legendToggleButton) {
  legendToggleButton.addEventListener("click", () => {
    if (!state.legend || state.legend.length <= 8) return;
    state.legendExpanded = !state.legendExpanded;
    renderLegend(state.legend);
  });
}

if (uploadTriggerButton) {
  uploadTriggerButton.addEventListener("click", () => {
    openImagePicker();
  });
}

if (previewUploadTriggerButton) {
  previewUploadTriggerButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openImagePicker();
  });
}

if (previewReuploadTriggerButton) {
  previewReuploadTriggerButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openImagePicker();
  });
}

if (generateNowButton) {
  generateNowButton.addEventListener("click", () => {
    generatePattern();
  });
}

if (regenerateButton) {
  regenerateButton.addEventListener("click", () => {
    generatePattern();
  });
}

if (clearWorkspaceButton) {
  clearWorkspaceButton.addEventListener("click", () => {
    const shouldClear = !state.sourceFile || window.confirm("确定清空当前作品和预览吗？");
    if (!shouldClear) return;
    clearWorkspace();
    setStatus("当前作品已清空。重新上传后可继续生成。");
  });
}

if (styleModeSelect) {
  styleModeSelect.addEventListener("change", () => {
    state.styleMode = getCurrentStyleMode();
    resetGeneratedPreviewState();
    syncWorkflowPreviewUI();
    scheduleAutoGenerate(180);
  });
}

if (workNameInput) {
  workNameInput.addEventListener("input", () => {
    state.workName = normalizeWorkName(workNameInput.value);
  });
}

if (copyPageLinkButton) {
  copyPageLinkButton.addEventListener("click", async () => {
    try {
      await copyCurrentPageLink();
      setStatus("链接已复制。请在系统浏览器粘贴打开后再导出。");
    } catch (_error) {
      setStatus("复制失败，请手动复制当前网址并在系统浏览器打开。");
    }
  });
}

if (previewEmptyState) {
  previewEmptyState.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  previewEmptyState.addEventListener("click", () => {
    openImagePicker();
  });
}

siteTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view || "create";
    setCurrentView(view);
  });
});

if (squareView) {
  squareView.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-square-action]");
    if (actionEl) {
      const action = actionEl.dataset.squareAction;
      const id = actionEl.dataset.id;
      if (action === "main-nav" && id) {
        state.square.activeMainNav = id;
        state.square.activeTag = "全部";
        state.square.activeTagOptions = TAG_OPTIONS[id] || ["全部"];
        applySquareFilters();
        renderSquareView();
        return;
      }
      if (action === "sort-nav" && id) {
        state.square.activeSortNav = id;
        applySquareFilters();
        renderSquareView();
        return;
      }
      if (action === "tag") {
        state.square.activeTag = actionEl.dataset.tag || "全部";
        applySquareFilters();
        renderSquareView();
        return;
      }
      if (action === "open-search") {
        state.square.showSearchPanel = true;
        state.square.searchDraft = state.square.searchKeyword;
        renderSquareView();
        window.requestAnimationFrame(() => {
          const input = document.getElementById("squareSearchInput");
          if (input) input.focus();
        });
        return;
      }
      if (action === "confirm-search") {
        const input = document.getElementById("squareSearchInput");
        state.square.searchKeyword = input ? input.value.trim() : state.square.searchDraft;
        state.square.searchDraft = state.square.searchKeyword;
        state.square.showSearchPanel = false;
        applySquareFilters();
        renderSquareView();
        return;
      }
      if (action === "clear-search") {
        state.square.searchKeyword = "";
        state.square.searchDraft = "";
        applySquareFilters();
        renderSquareView();
        return;
      }
      if (action === "filter-hint") {
        setStatus("可按场景、人群、难度筛选。");
        return;
      }
      if (action === "generate") {
        setCurrentView("create");
        openImagePicker();
        return;
      }
      if (action === "preview-paper" && id) {
        updateSquarePaperList(id, (item) => ({ ...item, views: item.views + 1 }));
        const paper = state.square.papers.find((item) => item.id === id);
        openEffectModal("/assets/logoxiangsu.png", `${paper ? paper.title : "图纸"} · 预览`, { pixelated: true });
        return;
      }
      if (action === "export-paper" && id) {
        updateSquarePaperList(id, (item) => ({ ...item, clones: item.clones + 1 }));
        setStatus("已模拟导出图纸，可继续进入创作页进行个性化调整。");
        return;
      }
      if (action === "edit-paper" && id) {
        const paper = state.square.papers.find((item) => item.id === id);
        if (workNameInput && paper) {
          workNameInput.value = paper.title;
        }
        state.workName = paper ? paper.title : "";
        setCurrentView("create");
        setStatus("已切换到创作页，可基于当前选中的图纸主题继续生成。");
        return;
      }
    }

    if (state.square.showSearchPanel && event.target.classList.contains("square-overlay")) {
      state.square.showSearchPanel = false;
      renderSquareView();
    }
  });

  squareView.addEventListener("input", (event) => {
    if (event.target && event.target.id === "squareSearchInput") {
      state.square.searchDraft = event.target.value || "";
    }
  });

  squareView.addEventListener("keydown", (event) => {
    if (event.target && event.target.id === "squareSearchInput" && event.key === "Enter") {
      state.square.searchKeyword = event.target.value.trim();
      state.square.searchDraft = state.square.searchKeyword;
      state.square.showSearchPanel = false;
      applySquareFilters();
      renderSquareView();
    }
  });
}

if (createWorksList) {
  createWorksList.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const workId = actionEl.dataset.workId;
    const action = actionEl.dataset.action;
    const viewType = actionEl.dataset.viewType || "grid";
    const work = state.workLibrary.find((item) => item.id === workId);
    if (!work) return;

    if (action === "rename-work") {
      const nextName = window.prompt("修改作品名称", work.title || "");
      const normalized = normalizeWorkName(nextName);
      if (!normalized) return;
      updateWorkRecord(workId, (item) => ({ ...item, title: normalized }));
      return;
    }

    if (action === "delete-work") {
      const confirmed = window.confirm("删除后不可恢复，确认删除吗？");
      if (!confirmed) return;
      state.workLibrary = state.workLibrary.filter((item) => item.id !== workId);
      persistWorkLibrary();
      renderCreateWorksList();
      renderProfileView();
      return;
    }

    if (action === "preview-work") {
      const imagePath = work.previewImages && work.previewImages[viewType] ? work.previewImages[viewType] : "";
      if (!imagePath) return;
      const label = viewType === "origin" ? "原图" : viewType === "grid" ? "图纸" : (String(work.style || "").includes("Q版") ? "Q版图" : "AI图");
      openEffectModal(imagePath, `${work.title} · ${label}`, {
        pixelated: viewType === "grid" || (viewType === "ai" && !String(work.style || "").includes("Q版"))
      });
    }
  });
}

if (profileView) {
  profileView.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-profile-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.profileAction;
    if (action === "records") {
      setCurrentView("create");
      return;
    }
    if (action === "copy-account") {
      try {
        await navigator.clipboard.writeText(state.accountId);
        setStatus("账号ID已复制。");
      } catch (_error) {
        setStatus("复制失败，请手动记录账号ID。");
      }
      return;
    }
    if (action === "contact") {
      setStatus("可先通过微信消息联系我们。");
      return;
    }
    setStatus("该功能仍在补齐中。");
  });
}

if (originPreviewCard) {
  originPreviewCard.addEventListener("click", () => {
    if (!state.sourcePreviewUrl) return;
    openEffectModal(state.sourcePreviewUrl, "原图预览", { pixelated: false });
  });
}

if (stylizedPreviewCard) {
  stylizedPreviewCard.addEventListener("click", () => {
    if (!state.stylizedPreviewUrl) return;
    openEffectModal(state.stylizedPreviewUrl, `${getStylizedLabel()}预览`, {
      pixelated: getCurrentStyleMode() !== STYLE_MODE_CARTOON
    });
  });
}

if (gridPreviewCard) {
  gridPreviewCard.addEventListener("click", () => {
    if (!state.grid) return;
    openPatternModal();
  });
}

if (openScenarioModalLink) {
  openScenarioModalLink.addEventListener("click", (event) => {
    event.preventDefault();
    openScenarioModalPanel();
  });
}

if (openEffectShowcaseModalLink) {
  openEffectShowcaseModalLink.addEventListener("click", (event) => {
    event.preventDefault();
    openEffectShowcaseModalPanel();
  });
}

if (scenarioModalBackdrop) {
  scenarioModalBackdrop.addEventListener("click", () => {
    closeScenarioModalPanel();
  });
}

if (scenarioModalClose) {
  scenarioModalClose.addEventListener("click", () => {
    closeScenarioModalPanel();
  });
}

if (effectShowcaseModalBackdrop) {
  effectShowcaseModalBackdrop.addEventListener("click", () => {
    closeEffectShowcaseModalPanel();
  });
}

if (effectShowcaseModalClose) {
  effectShowcaseModalClose.addEventListener("click", () => {
    closeEffectShowcaseModalPanel();
  });
}

if (effectCompareStage) {
  setEffectComparePosition(getEffectComparePosition());
  resetEffectViewScale();

  effectCompareStage.addEventListener(
    "wheel",
    (event) => {
      if (effectDragActive) return;
      event.preventDefault();
      const ratio = event.deltaY < 0 ? 1.12 : 0.9;
      setEffectViewScale(effectViewScale * ratio);
      effectSuppressClickUntil = Date.now() + 220;
    },
    { passive: false }
  );

  effectCompareStage.addEventListener("dblclick", () => {
    resetEffectViewScale();
    effectSuppressClickUntil = Date.now() + 180;
  });

  effectCompareStage.addEventListener("pointerdown", (event) => {
    if (effectDivider && (event.target === effectDivider || effectDivider.contains(event.target))) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    effectViewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (typeof effectCompareStage.setPointerCapture === "function") {
      try {
        effectCompareStage.setPointerCapture(event.pointerId);
      } catch (_err) {
        // Ignore capture failures on unsupported platforms.
      }
    }
    if (effectViewPointers.size >= 2) {
      effectViewPinchStartDistance = getEffectPointerDistance();
      effectViewPinchStartScale = effectViewScale;
    }
  });

  effectCompareStage.addEventListener("pointermove", (event) => {
    if (!effectViewPointers.has(event.pointerId)) return;
    effectViewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (effectDragActive || effectViewPointers.size < 2 || effectViewPinchStartDistance <= 0) return;
    const dist = getEffectPointerDistance();
    if (dist <= 0) return;
    const ratio = dist / effectViewPinchStartDistance;
    setEffectViewScale(effectViewPinchStartScale * ratio);
    effectSuppressClickUntil = Date.now() + 220;
  });

  const endEffectViewPointer = (event) => {
    if (effectViewPointers.has(event.pointerId)) {
      effectViewPointers.delete(event.pointerId);
    }
    if (typeof effectCompareStage.releasePointerCapture === "function") {
      try {
        effectCompareStage.releasePointerCapture(event.pointerId);
      } catch (_err) {
        // Ignore release failures on unsupported platforms.
      }
    }
    if (effectViewPointers.size < 2) {
      effectViewPinchStartDistance = 0;
      effectViewPinchStartScale = effectViewScale;
    }
  };

  effectCompareStage.addEventListener("pointerup", endEffectViewPointer);
  effectCompareStage.addEventListener("pointercancel", endEffectViewPointer);
}

if (effectCompareStage && effectDivider) {
  effectDivider.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    effectDragActive = true;
    effectDragMoved = false;
    effectDragPointerId = event.pointerId;
    effectCompareStage.setPointerCapture(event.pointerId);
    setEffectComparePosition(getEffectComparePositionFromClientX(event.clientX));
  });

  effectCompareStage.addEventListener("pointermove", (event) => {
    if (!effectDragActive || event.pointerId !== effectDragPointerId) return;
    effectDragMoved = true;
    setEffectComparePosition(getEffectComparePositionFromClientX(event.clientX));
  });

  const stopEffectDrag = (event) => {
    if (!effectDragActive) return;
    if (typeof event.pointerId === "number" && event.pointerId !== effectDragPointerId) return;
    if (effectDragMoved) {
      effectSuppressClickUntil = Date.now() + 220;
    }
    effectDragActive = false;
    effectDragPointerId = null;
    effectDragMoved = false;
  };

  effectCompareStage.addEventListener("pointerup", stopEffectDrag);
  effectCompareStage.addEventListener("pointercancel", stopEffectDrag);

  effectCompareStage.addEventListener("click", (event) => {
    if (Date.now() < effectSuppressClickUntil) return;

    const rect = effectCompareStage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = rect.width ? x / rect.width : 0;
    const split = clamp(getEffectComparePosition() / 100, 0, 1);

    if (ratio <= split) {
      openEffectModal("/assets/logo.png", "原图（放大）", { pixelated: false });
    } else {
      openEffectModal("/assets/logoxiangsu.png", "拼豆图纸效果（放大）", { pixelated: true });
    }
  });
}

if (effectOpenOriginalButton) {
  effectOpenOriginalButton.addEventListener("click", () => {
    openEffectModal("/assets/logo.png", "原图（放大）", { pixelated: false });
  });
}

if (effectOpenResultButton) {
  effectOpenResultButton.addEventListener("click", () => {
    openEffectModal("/assets/logoxiangsu.png", "拼豆图纸效果（放大）", { pixelated: true });
  });
}

if (effectModalBackdrop) {
  effectModalBackdrop.addEventListener("click", () => {
    closeEffectModal();
  });
}

if (effectModalClose) {
  effectModalClose.addEventListener("click", () => {
    closeEffectModal();
  });
}

if (effectModalReset) {
  effectModalReset.addEventListener("click", () => {
    effectModalZoom.reset();
  });
}

imageInput.addEventListener("click", (event) => {
  if (!state.sourceFile) return;
  const confirmed = window.confirm("该操作会清空画布，是否确定执行？");
  if (!confirmed) {
    event.preventDefault();
  }
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;
  updateUploadFilename();
  if (state.sourceFile) {
    clearWorkspace({ keepName: false });
  }
  await openCropModal(file);
});

exportPngButton.addEventListener("click", () => {
  if (!state.grid) return;
  openExportModal("png");
});

exportPdfButton.addEventListener("click", async () => {
  if (!state.grid) return;
  openExportModal("pdf");
});

if (exportModalBackdrop) {
  exportModalBackdrop.addEventListener("click", closeExportModal);
}

if (exportModalClose) {
  exportModalClose.addEventListener("click", closeExportModal);
}

if (exportFormatSelect) {
  exportFormatSelect.addEventListener("change", () => {
    state.exportSettings.format = exportFormatSelect.value === "png" ? "png" : "pdf";
    syncExportControls();
  });
}

if (exportModeSelect) {
  exportModeSelect.addEventListener("change", () => {
    const format = getActiveExportFormat();
    if (format === "png") {
      state.exportSettings.pngMode = exportModeSelect.value === "standard" ? "standard" : "ultra";
    } else {
      state.exportSettings.pdfMode = exportModeSelect.value === "ultra" ? "ultra" : "a4";
    }
    syncExportControls();
  });
}

if (exportConfirmButton) {
  exportConfirmButton.addEventListener("click", () => {
    handleExportConfirm();
  });
}

zoomModalClose.addEventListener("click", closeZoomModal);
zoomModalBackdrop.addEventListener("click", closeZoomModal);
zoomModalReset.addEventListener("click", () => {
  modalZoom.reset();
});

cropModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setCropMode(button.dataset.cropMode, { initialize: false });
  });
});

cropResetButton.addEventListener("click", () => {
  if (!cropState.image) return;
  resetCropView();
  renderCropCanvas();
});

cropCancelButton.addEventListener("click", () => {
  closeCropModal();
  setStatus("已取消裁剪。准备好后可重新选择图片。");
});

cropConfirmButton.addEventListener("click", async () => {
  if (!cropState.image) return;

  cropConfirmButton.disabled = true;
  cropConfirmButton.textContent = "应用中...";

  const croppedFile = await buildCroppedFile();
  cropConfirmButton.disabled = false;
  cropConfirmButton.textContent = "应用裁剪";

  if (!croppedFile) {
    setStatus("图片裁剪失败。");
    return;
  }

  state.sourceFile = croppedFile;
  setPreviewUrl("source", URL.createObjectURL(croppedFile));
  resetGeneratedPreviewState();
  if (workNameInput && !normalizeWorkName(workNameInput.value)) {
    workNameInput.value = normalizeWorkName(croppedFile.name.replace(/\.[^.]+$/, ""));
  }
  updatePreviewEmptyState();
  refreshColorUsageStatus();
  syncWorkflowPreviewUI();
  closeCropModal();
  await generatePattern(croppedFile);
});

cropModalBackdrop.addEventListener("click", () => {
  closeCropModal();
  setStatus("已取消裁剪。准备好后可重新选择图片。");
});

cropCanvas.addEventListener("pointerdown", startCropInteraction);
cropCanvas.addEventListener("pointermove", moveCropInteraction);
window.addEventListener("pointerup", endCropInteraction);
window.addEventListener("pointercancel", endCropInteraction);

cropCanvas.addEventListener(
  "wheel",
  (event) => {
    if (!cropState.image || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    const point = getCropPointFromEvent(event);
    const ratio = event.deltaY < 0 ? 1.11 : 0.9;
    setCropZoom(cropState.zoom * ratio, point.x, point.y);
  },
  { passive: false }
);

patternViewport.addEventListener("pointermove", (event) => {
  if (!state.grid) {
    patternCoordBadge.textContent = "X - / Y -";
    return;
  }
  const rect = patternViewport.getBoundingClientRect();
  const vx = event.clientX - rect.left;
  const vy = event.clientY - rect.top;
  const coord = getPatternCoordFromViewport(vx, vy);
  if (!coord) {
    patternCoordBadge.textContent = "X - / Y -";
    return;
  }
  patternCoordBadge.textContent = `X ${coord.x} / Y ${coord.y}`;
});

patternViewport.addEventListener("pointerleave", () => {
  patternCoordBadge.textContent = "X - / Y -";
});

window.addEventListener("resize", () => {
  if (!cropModal.hidden && cropState.image) {
    resizeCropCanvas();
    cropState.centerX = cropState.viewWidth / 2;
    cropState.centerY = cropState.viewHeight / 2;
    constrainCropRectToImage();
    renderCropCanvas();
  }
  if (exportModal && !exportModal.hidden) {
    renderExportPreview();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (effectModal && !effectModal.hidden) {
      closeEffectModal();
      return;
    }
    if (effectShowcaseModal && !effectShowcaseModal.hidden) {
      closeEffectShowcaseModalPanel();
      return;
    }
    if (scenarioModal && !scenarioModal.hidden) {
      closeScenarioModalPanel();
      return;
    }
    if (!cropModal.hidden) {
      closeCropModal();
      setStatus("已取消裁剪。准备好后可重新选择图片。");
      return;
    }
    if (exportModal && !exportModal.hidden) {
      closeExportModal();
      return;
    }
    closeZoomModal();
  }
});

syncMaxEdgeControls({ resetToMax: true });
loadPalettes();
ensureAccountId();
loadWorkLibrary();
applySquareFilters();
renderSquareView();
renderCreateWorksList();
renderProfileView();
updateStyleModeHint();
syncExportControls();
updateUploadFilename();
updatePreviewEmptyState();
refreshColorUsageStatus();
renderExportPreview();
updateWechatNoticeVisibility();
setButtons(false);
setGeneratingState(false);
syncWorkflowPreviewUI();
setCurrentView(state.currentView);
setStatus("请选择一张照片，放大并裁成上半身或头像，完成裁剪后系统会自动生成拼豆图纸。");
patternZoom.setContent(patternCanvas, patternCanvas.width, patternCanvas.height);
zoomModalCanvas.hidden = true;
zoomModalCanvas.style.display = "none";
updateCropModeButtons();
clearPatternRulers();
patternCoordBadge.textContent = "X - / Y -";
