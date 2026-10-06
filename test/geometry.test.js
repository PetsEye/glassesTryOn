import test from 'node:test';
import assert from 'node:assert/strict';
import {
  angleBetween,
  clamp,
  computeGlassesTransform,
  computeTempleGeometry,
  distance,
  estimateYaw,
  interpolate,
  midpoint,
} from '../src/geometry.js';

test('midpoint averages two points', () => {
  assert.deepEqual(midpoint({ x: 2, y: 4 }, { x: 6, y: 8 }), { x: 4, y: 6 });
});

test('distance is euclidean', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('angleBetween reports zero for horizontal points', () => {
  assert.equal(angleBetween({ x: 0, y: 0 }, { x: 1, y: 0 }), 0);
});

test('interpolate returns endpoints and midpoint', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 20 };
  assert.deepEqual(interpolate(a, b, 0), a);
  assert.deepEqual(interpolate(a, b, 1), b);
  assert.deepEqual(interpolate(a, b, 0.5), { x: 5, y: 10 });
});

test('clamp bounds values', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test('transform anchors between the eyes with no rotation', () => {
  const t = computeGlassesTransform({
    leftEye: { x: 0.4, y: 0.5 },
    rightEye: { x: 0.6, y: 0.5 },
    canvasWidth: 1000,
    canvasHeight: 1000,
    spriteWidth: 200,
    spriteHeight: 80,
    spread: 0.215,
  });
  assert.equal(t.anchorX, 500);
  assert.equal(t.anchorY, 500);
  assert.equal(t.rotation, 0);
  assert.equal(t.interocular, 200);
  assert.equal(t.spriteBridgeX, 100);
  assert.equal(t.spriteEyeY, 40);
  assert.ok(Math.abs(t.scale - 200 / (2 * 0.215 * 200)) < 1e-9);
});

test('scale grows with pupil distance', () => {
  const base = { canvasWidth: 1000, canvasHeight: 1000, spriteWidth: 200, spriteHeight: 80 };
  const near = computeGlassesTransform({ ...base, leftEye: { x: 0.45, y: 0.5 }, rightEye: { x: 0.55, y: 0.5 } });
  const far = computeGlassesTransform({ ...base, leftEye: { x: 0.35, y: 0.5 }, rightEye: { x: 0.65, y: 0.5 } });
  assert.ok(far.scale > near.scale);
  assert.ok(Math.abs(far.scale / near.scale - 3) < 1e-9);
});

test('rotation follows the eye line', () => {
  const t = computeGlassesTransform({
    leftEye: { x: 0.4, y: 0.45 },
    rightEye: { x: 0.6, y: 0.55 },
    canvasWidth: 1000,
    canvasHeight: 1000,
    spriteWidth: 200,
    spriteHeight: 80,
  });
  assert.ok(Math.abs(t.rotation - Math.atan2(100, 200)) < 1e-9);
  assert.ok(t.rotationDeg > 0);
});

test('estimateYaw is zero when the nose is centered', () => {
  const yaw = estimateYaw({
    nose: { x: 0.5, y: 0.5 },
    leftEdge: { x: 0.2, y: 0.5 },
    rightEdge: { x: 0.8, y: 0.5 },
  });
  assert.ok(Math.abs(yaw) < 1e-9);
});

test('estimateYaw is signed by the direction the head turns', () => {
  const yaw = estimateYaw({
    nose: { x: 0.6, y: 0.5 },
    leftEdge: { x: 0.2, y: 0.5 },
    rightEdge: { x: 0.8, y: 0.5 },
  });
  assert.ok(yaw < 0);
  assert.ok(Math.abs(yaw - -1 / 3) < 1e-9);
});

test('estimateYaw stays within [-1, 1]', () => {
  const yaw = estimateYaw({
    nose: { x: 5, y: 0 },
    leftEdge: { x: 0, y: 0 },
    rightEdge: { x: 1, y: 0 },
  });
  assert.ok(yaw >= -1 && yaw <= 1);
});

test('near temple extends past the ear, far temple is shortened', () => {
  const near = computeTempleGeometry({ hinge: { x: 0, y: 0 }, ear: { x: 10, y: 0 }, side: 'near' });
  const far = computeTempleGeometry({ hinge: { x: 0, y: 0 }, ear: { x: 10, y: 0 }, side: 'far' });
  assert.ok(near.end.x > 10);
  assert.ok(far.end.x < 10);
  assert.equal(near.alpha, 1);
});

test('far temple fades as yaw grows', () => {
  const frontal = computeTempleGeometry({ hinge: { x: 0, y: 0 }, ear: { x: 10, y: 0 }, side: 'far', yaw: 0 });
  const turned = computeTempleGeometry({ hinge: { x: 0, y: 0 }, ear: { x: 10, y: 0 }, side: 'far', yaw: 0.5 });
  assert.ok(turned.alpha < frontal.alpha);
  assert.ok(turned.alpha >= 0.12);
});

test('temple width scales with the provided thickness', () => {
  const thin = computeTempleGeometry({ hinge: { x: 0, y: 0 }, ear: { x: 10, y: 0 }, thickness: 4 });
  const thick = computeTempleGeometry({ hinge: { x: 0, y: 0 }, ear: { x: 10, y: 0 }, thickness: 8 });
  assert.ok(thick.width > thin.width);
});

test('vertical offset moves the anchor by a fraction of pupil distance', () => {
  const t = computeGlassesTransform({
    leftEye: { x: 0.4, y: 0.5 },
    rightEye: { x: 0.6, y: 0.5 },
    canvasWidth: 1000,
    canvasHeight: 1000,
    spriteWidth: 200,
    spriteHeight: 80,
    yOffset: 0.1,
  });
  assert.equal(t.anchorY, 500 + 0.1 * 200);
});
