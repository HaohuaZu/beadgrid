function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Pack grid indexes into compact base36 string.
// -1 -> 0, 0 -> 1, ... so each cell uses 2 chars.
function packIndexGrid(indexGrid, maxPaletteIndex = 255) {
  if (!Array.isArray(indexGrid) || !indexGrid.length) return "";
  const maxValue = Math.max(0, Number(maxPaletteIndex) || 255);
  let output = "";
  for (let i = 0; i < indexGrid.length; i += 1) {
    const raw = Number(indexGrid[i]);
    let value = Number.isFinite(raw) ? raw : 0;
    if (value < -1) value = -1;
    if (value > maxValue) value = maxValue;
    output += (value + 1).toString(36).padStart(2, "0");
  }
  return output;
}

function unpackIndexGrid(packed, cellCount, maxPaletteIndex = 255) {
  const safeCount = Math.max(0, Number(cellCount) || 0);
  if (!safeCount) return [];
  const text = typeof packed === "string" ? packed : "";
  if (!text) return [];
  const maxValue = Math.max(0, Number(maxPaletteIndex) || 255);

  const output = new Array(safeCount);
  for (let i = 0; i < safeCount; i += 1) {
    const chunk = text.slice(i * 2, i * 2 + 2);
    if (chunk.length < 2) {
      output[i] = 0;
      continue;
    }
    const num = parseInt(chunk, 36);
    if (!Number.isFinite(num)) {
      output[i] = 0;
      continue;
    }
    const value = num - 1;
    if (value < -1) {
      output[i] = -1;
      continue;
    }
    output[i] = clamp(value, -1, maxValue);
  }
  return output;
}

module.exports = {
  packIndexGrid,
  unpackIndexGrid
};

