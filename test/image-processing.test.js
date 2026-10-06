import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageColor,
  cropData,
  estimateBackgroundColor,
  findContentBounds,
  hasTransparency,
  keyOutBackground,
  prepareGlassesData,
} from '../src/image-processing.js';

function makeImage(width, height, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
  return data;
}

function fillRect(data, width, rect, color) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
}

test('hasTransparency detects an alpha channel', () => {
  const opaque = makeImage(10, 10);
  assert.equal(hasTransparency(opaque), false);
  const cutout = makeImage(10, 10, [0, 0, 0, 0]);
  assert.equal(hasTransparency(cutout), true);
});

test('estimateBackgroundColor reads a uniform white corner', () => {
  const data = makeImage(20, 20);
  const bg = estimateBackgroundColor(data, 20, 20);
  assert.equal(Math.round(bg.r), 255);
  assert.equal(Math.round(bg.g), 255);
  assert.equal(Math.round(bg.b), 255);
});

test('keyOutBackground removes matching pixels and keeps the subject', () => {
  const width = 20;
  const data = makeImage(width, 20);
  fillRect(data, width, { x: 7, y: 7, width: 6, height: 6 }, [255, 0, 0, 255]);
  const keyed = keyOutBackground(data, width, 20, { tolerance: 42 });
  assert.equal(keyed[3], 0);
  const center = (10 * width + 10) * 4;
  assert.equal(keyed[center + 3], 255);
  assert.equal(keyed[center], 255);
});

test('findContentBounds trims to the visible subject', () => {
  const width = 20;
  const data = makeImage(width, 20, [0, 0, 0, 0]);
  fillRect(data, width, { x: 5, y: 6, width: 7, height: 4 }, [10, 20, 30, 255]);
  const bounds = findContentBounds(data, width, 20);
  assert.deepEqual(bounds, { x: 5, y: 6, width: 7, height: 4 });
});

test('findContentBounds returns null for a fully transparent image', () => {
  const data = makeImage(8, 8, [0, 0, 0, 0]);
  assert.equal(findContentBounds(data, 8, 8), null);
});

test('cropData extracts the requested window', () => {
  const width = 4;
  const data = makeImage(width, 4, [0, 0, 0, 0]);
  fillRect(data, width, { x: 1, y: 1, width: 2, height: 2 }, [9, 9, 9, 255]);
  const cropped = cropData(data, width, { x: 1, y: 1, width: 2, height: 2 });
  assert.equal(cropped.length, 2 * 2 * 4);
  assert.equal(cropped[0], 9);
  assert.equal(cropped[3], 255);
});

test('prepareGlassesData removes a plain background and crops', () => {
  const width = 20;
  const data = makeImage(width, 20);
  fillRect(data, width, { x: 7, y: 7, width: 6, height: 6 }, [20, 40, 60, 255]);
  const prepared = prepareGlassesData(data, width, 20, { tolerance: 42 });
  assert.ok(prepared);
  assert.equal(prepared.usedColorKey, true);
  assert.deepEqual(prepared.bounds, { x: 7, y: 7, width: 6, height: 6 });
  assert.equal(prepared.width, 6);
  assert.equal(prepared.height, 6);
});

test('prepareGlassesData preserves an existing alpha cutout', () => {
  const width = 12;
  const data = makeImage(width, 12, [0, 0, 0, 0]);
  fillRect(data, width, { x: 2, y: 3, width: 5, height: 4 }, [200, 100, 50, 255]);
  const prepared = prepareGlassesData(data, width, 12);
  assert.ok(prepared);
  assert.equal(prepared.usedColorKey, false);
  assert.deepEqual(prepared.bounds, { x: 2, y: 3, width: 5, height: 4 });
});

test('prepareGlassesData returns null when nothing is visible', () => {
  const data = makeImage(10, 10, [0, 0, 0, 0]);
  assert.equal(prepareGlassesData(data, 10, 10), null);
});

test('averageColor ignores transparent pixels', () => {
  const width = 4;
  const data = makeImage(width, 4, [0, 0, 0, 0]);
  fillRect(data, width, { x: 0, y: 0, width: 2, height: 2 }, [100, 50, 25, 255]);
  const color = averageColor(data);
  assert.deepEqual(color, { r: 100, g: 50, b: 25 });
});

test('averageColor falls back to a dark default when empty', () => {
  const color = averageColor(makeImage(4, 4, [0, 0, 0, 0]));
  assert.deepEqual(color, { r: 23, g: 24, b: 26 });
});
