const imageInput = document.getElementById("imageInput");
const uploadTriggerButton = document.getElementById("uploadTrigger");
const uploadFilenameEl = document.getElementById("uploadFilename");
const gridSizeSelect = document.getElementById("gridSize");
const maxEdgeSizeRangeInput = document.getElementById("maxEdgeSizeRange");
const maxEdgeSizeInput = document.getElementById("maxEdgeSize");
const paletteSelect = document.getElementById("palette");
const samplingModeSelect = document.getElementById("samplingMode");
const optimizeInput = document.getElementById("optimize");
const showCodesInput = document.getElementById("showCodes");

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

const zoomModal = document.getElementById("zoomModal");
const zoomModalBackdrop = document.getElementById("zoomModalBackdrop");
const zoomModalClose = document.getElementById("zoomModalClose");
const zoomModalReset = document.getElementById("zoomModalReset");
const zoomModalTitle = document.getElementById("zoomModalTitle");
const zoomModalViewport = document.getElementById("zoomModalViewport");
const zoomModalCanvas = document.getElementById("zoomModalCanvas");

const effectCompareStage = document.getElementById("effectCompareStage");
const effectDivider = document.querySelector(".effect-divider");
const effectOpenOriginalButton = document.getElementById("effectOpenOriginal");
const effectOpenResultButton = document.getElementById("effectOpenResult");
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

const CROP_MIN_SIZE = 48;
const CROP_HANDLE_SIZE = 10;
const CROP_MARGIN_RATIO = 0.08;

const state = {
  grid: null,
  legend: null,
  gridSize: DEFAULT_GRID_SIZE,
  codeByHex: null,
  codeGrid: null,
  sourceFile: null,
  patternLayout: null,
  legendExpanded: false
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

function setStatus(message) {
  statusEl.textContent = message;
}

function setButtons(enabled) {
  exportPngButton.disabled = !enabled;
  exportPdfButton.disabled = !enabled;
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
  const sortedLegend = [...legend].sort((a, b) => {
    const countDiff = (b.count || 0) - (a.count || 0);
    if (countDiff !== 0) return countDiff;
    const codeA = a.code || "";
    const codeB = b.code || "";
    return codeA.localeCompare(codeB, "zh-CN");
  });
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
  const shouldShowEmpty = !state.grid;
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

function openEffectModal(src, title) {
  if (!effectModal || !effectModalImage || !effectModalTitle || !effectModalViewport) return;
  effectModalImage.src = src;
  effectModalTitle.textContent = title;
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

function getUltraPngSize(gridSize) {
  const preferred = Math.round(gridSize * PNG_EXPORT_TARGET_CELL_SIZE + 180);
  return clamp(preferred, PNG_EXPORT_MIN_SIZE, PNG_EXPORT_MAX_SIZE);
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
    !zoomModal.hidden || !cropModal.hidden || (effectModal && !effectModal.hidden);
  document.body.classList.toggle("modal-open", isAnyModalOpen);
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
    if (typeof viewportEl.setPointerCapture === "function") {
      try {
        viewportEl.setPointerCapture(event.pointerId);
      } catch (_err) {
        // Ignore capture failures on unsupported platforms.
      }
    }

    if (stateZoom.activePointers.size >= 2) {
      stateZoom.pinching = true;
      stateZoom.dragging = false;
      stateZoom.suppressClick = true;
      stateZoom.pinchStartDistance = getPointerPairDistance();
      stateZoom.pinchStartZoom = stateZoom.zoom;
      viewportEl.classList.remove("is-dragging");
      return;
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
    renderPatternCanvas();
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

function renderPatternCanvas() {
  if (!state.grid) return;
  state.patternLayout = drawGrid(patternCanvas, state.grid, {
    gridLines: true,
    axisLabels: false,
    showCodes: shouldShowCodes(false),
    codeByHex: state.codeByHex,
    codeGrid: state.codeGrid
  });
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
  clearLegend();
  updateLegendToggle(0);
  setButtons(false);
  clearPatternRulers();
  patternCoordBadge.textContent = "X - / Y -";
  updateUploadFilename();
  updatePreviewEmptyState();
  refreshColorUsageStatus();

  const ctx = patternCanvas.getContext("2d");
  ctx.clearRect(0, 0, patternCanvas.width, patternCanvas.height);
  ctx.fillStyle = "#f2efe8";
  ctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
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
  setStatus("正在生成图纸...");
  setButtons(false);

  const formData = new FormData();
  formData.append("image", file);
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

  try {
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
    updatePreviewEmptyState();

    renderPatternCanvas();
    renderLegend(state.legend);
    refreshColorUsageStatus();
    refreshReadyStatus();
    setButtons(true);

    if (!zoomModal.hidden) {
      renderModalPattern();
    }
  } catch (_error) {
    if (runId !== generationId) return;
    setStatus("图纸生成失败。");
    setButtons(Boolean(state.grid));
    updatePreviewEmptyState();
    refreshColorUsageStatus();
  }
}

function openPatternModal() {
  if (!state.grid) return;
  zoomModalTitle.textContent = "图纸（放大）";
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

if (previewEmptyState) {
  previewEmptyState.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  previewEmptyState.addEventListener("click", () => {
    openImagePicker();
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
      openEffectModal("/assets/logo.png", "原图（放大）");
    } else {
      openEffectModal("/assets/logoxiangsu.png", "拼豆图纸效果（放大）");
    }
  });
}

if (effectOpenOriginalButton) {
  effectOpenOriginalButton.addEventListener("click", () => {
    openEffectModal("/assets/logo.png", "原图（放大）");
  });
}

if (effectOpenResultButton) {
  effectOpenResultButton.addEventListener("click", () => {
    openEffectModal("/assets/logoxiangsu.png", "拼豆图纸效果（放大）");
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
    state.sourceFile = null;
    clearPatternOutput();
  }
  await openCropModal(file);
});

exportPngButton.addEventListener("click", () => {
  if (!state.grid) return;
  setStatus("正在准备超清 PNG...");

  const exportSize = getUltraPngSize(state.grid.length);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = exportSize;
  exportCanvas.height = exportSize;

  drawGrid(exportCanvas, state.grid, {
    gridLines: true,
    axisLabels: true,
    axisLabelStep: 1,
    axisColor: "#111111",
    tintAlpha: 0.2,
    showCodes: showCodesInput.checked,
    codeByHex: state.codeByHex,
    codeGrid: state.codeGrid
  });

  exportCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("PNG 导出失败。");
      return;
    }
    downloadBlob(blob, "bead-pattern-ultra.png");
    setStatus("超清 PNG 导出完成。");
  });
});

exportPdfButton.addEventListener("click", async () => {
  if (!state.grid) return;

  try {
    setStatus("正在准备高清 PDF...");
    const res = await fetch("/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grid: state.grid,
        legend: state.legend,
        codeGrid: showCodesInput.checked ? state.codeGrid : null,
        title: "Bead Pattern",
        pdfMode: "ultra"
      })
    });

    if (!res.ok) {
      setStatus("高清 PDF 生成失败。");
      return;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/pdf")) {
      setStatus("高清 PDF 导出失败（返回内容异常）。");
      return;
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      setStatus("高清 PDF 导出失败（空文件）。");
      return;
    }

    downloadBlob(blob, "bead-pattern-ultra.pdf");
    const sizeKb = Math.max(1, Math.round(blob.size / 1024));
    setStatus(`高清 PDF 导出完成（${sizeKb} KB）。`);
  } catch (_error) {
    setStatus("高清 PDF 导出失败。");
  }
});

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
  updatePreviewEmptyState();
  refreshColorUsageStatus();
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
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (effectModal && !effectModal.hidden) {
      closeEffectModal();
      return;
    }
    if (!cropModal.hidden) {
      closeCropModal();
      setStatus("已取消裁剪。准备好后可重新选择图片。");
      return;
    }
    closeZoomModal();
  }
});

syncMaxEdgeControls({ resetToMax: true });
loadPalettes();
updateUploadFilename();
updatePreviewEmptyState();
refreshColorUsageStatus();
setButtons(false);
setStatus("请选择一张照片，放大并裁成上半身或头像，完成裁剪后系统会自动生成拼豆图纸。");
patternZoom.setContent(patternCanvas, patternCanvas.width, patternCanvas.height);
zoomModalCanvas.hidden = true;
zoomModalCanvas.style.display = "none";
updateCropModeButtons();
clearPatternRulers();
patternCoordBadge.textContent = "X - / Y -";
