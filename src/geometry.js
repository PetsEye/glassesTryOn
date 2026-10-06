// Pure geometric helpers for fitting a glasses sprite over face landmarks.
// All landmark inputs are normalized {x, y} in [0, 1] source-image space.

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Compute the canvas transform that maps a glasses sprite onto a face.
 *
 * The sprite is anchored by the midpoint of its two lens centers. That anchor
 * is placed on the midpoint of the user's pupils, rotated to match eye roll,
 * and scaled so the sprite's lens-center span matches the pupil distance.
 */
export function computeGlassesTransform({
  leftEye,
  rightEye,
  bridge,
  canvasWidth,
  canvasHeight,
  spriteWidth,
  spriteHeight,
  spread = 0.215,
  verticalAnchor = 0.5,
  scale = 1,
  yOffset = 0,
}) {
  const left = { x: leftEye.x * canvasWidth, y: leftEye.y * canvasHeight };
  const right = { x: rightEye.x * canvasWidth, y: rightEye.y * canvasHeight };
  const eyeMid = midpoint(left, right);
  const interocular = Math.max(distance(left, right), 1);
  const rotation = angleBetween(left, right);
  const rotationDeg = (rotation * 180) / Math.PI;

  const lensSpan = 2 * spread * spriteWidth;
  const frameScale = (interocular * scale) / lensSpan;

  const spriteBridgeX = 0.5 * spriteWidth;
  const spriteEyeY = verticalAnchor * spriteHeight;
  const anchorX = eyeMid.x;
  const anchorY = eyeMid.y + yOffset * interocular;

  const bridgePoint = bridge
    ? { x: bridge.x * canvasWidth, y: bridge.y * canvasHeight }
    : eyeMid;

  return {
    anchorX,
    anchorY,
    rotation,
    rotationDeg,
    scale: frameScale,
    spriteBridgeX,
    spriteEyeY,
    interocular,
    eyeMid,
    bridgePoint,
  };
}

export function interpolate(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
