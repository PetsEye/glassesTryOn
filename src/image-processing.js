// Pure RGBA pixel helpers used to turn an arbitrary glasses photo into a
// transparent, tightly-cropped sprite. Operates on plain typed arrays so the
// logic can be unit-tested in Node without a canvas.

export const DEFAULT_TOLERANCE = 42;
export const DEFAULT_ALPHA_THRESHOLD = 12;

export function hasTransparency(data, { alphaThreshold = 200, minFraction = 0.03 } = {}) {
  const total = data.length / 4;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < alphaThreshold) transparent += 1;
  }
  return transparent / total >= minFraction;
}

function patchStats(data, width, height, ox, oy, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let r2 = 0;
  let g2 = 0;
  let b2 = 0;
  let n = 0;
  for (let y = oy; y < oy + size; y += 1) {
    for (let x = ox; x < ox + size; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      r2 += data[i] * data[i];
      g2 += data[i + 1] * data[i + 1];
      b2 += data[i + 2] * data[i + 2];
      n += 1;
    }
  }
  if (n === 0) return { mean: { r: 255, g: 255, b: 255 }, variance: 0 };
  const mean = { r: r / n, g: g / n, b: b / n };
  const variance = r2 / n - mean.r * mean.r + (g2 / n - mean.g * mean.g) + (b2 / n - mean.b * mean.b);
  return { mean, variance };
}

/**
 * Guess the background color from the most uniform corner patch. This is more
 * robust than averaging every border pixel when the glasses touch an edge.
 */
export function estimateBackgroundColor(data, width, height, { patch = 6 } = {}) {
  const corners = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  let best = null;
  for (const [ox, oy] of corners) {
    const stats = patchStats(data, width, height, ox, oy, patch);
    if (!best || stats.variance < best.variance) best = stats;
  }
  return best.mean;
}

function colorDistance(data, i, background) {
  const dr = data[i] - background.r;
  const dg = data[i + 1] - background.g;
  const db = data[i + 2] - background.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Return a copy of the pixel data with background-colored pixels made
 * transparent. Edge pixels get partial alpha for a soft cutout.
 */
export function keyOutBackground(
  data,
  width,
  height,
  { tolerance = DEFAULT_TOLERANCE, background } = {},
) {
  const bg = background || estimateBackgroundColor(data, width, height);
  const feather = tolerance * 0.8;
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const dist = colorDistance(data, i, bg);
    if (dist <= tolerance) {
      out[i + 3] = 0;
    } else if (dist <= tolerance + feather) {
      const ratio = (dist - tolerance) / feather;
      out[i + 3] = Math.min(out[i + 3], Math.round(255 * ratio));
    }
  }
  return out;
}

/**
 * Average color of the visible (non-transparent) pixels, used to tint
 * synthetic temple arms to match the uploaded frame.
 */
export function averageColor(data, { alphaThreshold = 40 } = {}) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > alphaThreshold) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  if (n === 0) return { r: 23, g: 24, b: 26 };
  return { r: r / n, g: g / n, b: b / n };
}

export function findContentBounds(data, width, height, { alphaThreshold = DEFAULT_ALPHA_THRESHOLD } = {}) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function cropData(data, width, bounds) {
  const out = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const srcStart = ((bounds.y + y) * width + bounds.x) * 4;
    const dstStart = y * bounds.width * 4;
    out.set(data.subarray(srcStart, srcStart + bounds.width * 4), dstStart);
  }
  return out;
}

/**
 * Full pipeline: if the image already has alpha, keep it; otherwise remove the
 * background color, then crop to the visible glasses.
 */
export function prepareGlassesData(data, width, height, options = {}) {
  const { tolerance = DEFAULT_TOLERANCE, alphaThreshold = DEFAULT_ALPHA_THRESHOLD } = options;
  const alreadyTransparent = hasTransparency(data, { minFraction: 0.03 });
  let working = data;
  let background = null;
  let usedColorKey = false;

  if (!alreadyTransparent) {
    background = estimateBackgroundColor(data, width, height);
    working = keyOutBackground(data, width, height, { tolerance, background });
    usedColorKey = true;
  }

  const bounds = findContentBounds(working, width, height, { alphaThreshold });
  if (!bounds) return null;

  const cropped = cropData(working, width, bounds);
  return {
    data: cropped,
    width: bounds.width,
    height: bounds.height,
    bounds,
    background,
    usedColorKey,
  };
}
