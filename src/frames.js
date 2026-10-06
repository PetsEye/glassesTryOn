// Built-in frame sprites, drawn with the 2D canvas API so the lens-center
// geometry is known exactly and the same rendering path handles uploads.

const DESIGN = { width: 200, height: 80, scale: 3 };
const STROKE = 5;

function roundRectPath(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawLens(ctx, cx, cy, shape, color, flip) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.lineWidth = STROKE;
  ctx.strokeStyle = color;
  ctx.fillStyle = 'rgba(206, 220, 205, 0.16)';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape === 'round') {
    ctx.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
  } else if (shape === 'oval') {
    ctx.ellipse(0, 0, 44, 28, 0, 0, Math.PI * 2);
  } else if (shape === 'square') {
    roundRectPath(ctx, -38, -27, 76, 54, 12);
  } else {
    ctx.moveTo(40, 16);
    ctx.quadraticCurveTo(43, -16, 18, -26);
    ctx.quadraticCurveTo(-12, -34, -33, -11);
    ctx.quadraticCurveTo(-43, 6, -31, 20);
    ctx.quadraticCurveTo(2, 34, 40, 16);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPreset(ctx, shape, color) {
  const { width: W } = DESIGN;
  const cy = 40;
  const leftCx = 57;
  const rightCx = 143;

  ctx.strokeStyle = color;
  ctx.lineWidth = STROKE;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(leftCx - 36, 28);
  ctx.lineTo(6, 20);
  ctx.moveTo(rightCx + 36, 28);
  ctx.lineTo(W - 6, 20);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(leftCx + 34, 24);
  ctx.quadraticCurveTo(W / 2, 10, rightCx - 34, 24);
  ctx.stroke();

  drawLens(ctx, leftCx, cy, shape, color, shape === 'cat');
  drawLens(ctx, rightCx, cy, shape, color, false);
}

function renderPreset(shape, color) {
  const canvas = document.createElement('canvas');
  canvas.width = DESIGN.width * DESIGN.scale;
  canvas.height = DESIGN.height * DESIGN.scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(DESIGN.scale, DESIGN.scale);
  drawPreset(ctx, shape, color);
  return canvas;
}

const PRESETS = [
  { name: 'The Tilden', finish: 'Ink black', price: '$120', color: '#17181a', shape: 'round' },
  { name: 'The Marais', finish: 'Honey tortoise', price: '$145', color: '#8a532b', shape: 'cat' },
  { name: 'The Hiro', finish: 'Soft silver', price: '$160', color: '#9fa2a0', shape: 'square' },
  { name: 'The Bower', finish: 'Moss green', price: '$135', color: '#3d5140', shape: 'oval' },
];

export function createPresetFrames() {
  return PRESETS.map((preset, index) => ({
    id: `preset-${index}`,
    name: preset.name,
    finish: preset.finish,
    price: preset.price,
    kind: 'preset',
    sprite: renderPreset(preset.shape, preset.color),
    defaultSpread: 0.215,
    defaultAnchorY: 0.5,
  }));
}
