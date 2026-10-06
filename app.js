import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm';

const video = document.querySelector('#camera');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('#stage');
const message = document.querySelector('#stageMessage');
const startButton = document.querySelector('#startButton');
const captureButton = document.querySelector('#captureButton');
const status = document.querySelector('#statusPill span');
const frameList = document.querySelector('#frameList');
const frameName = document.querySelector('#frameName');
const frameFinish = document.querySelector('#frameFinish');
const frameCount = document.querySelector('#frameCount');

const frames = [
  { name: 'The Tilden', finish: 'Ink black', price: '$120', color: '#171817', shape: 'round' },
  { name: 'The Marais', finish: 'Honey tortoise', price: '$145', color: '#8b542c', shape: 'cat' },
  { name: 'The Hiro', finish: 'Soft silver', price: '$160', color: '#a8aaa5', shape: 'square' },
  { name: 'The Bower', finish: 'Moss green', price: '$135', color: '#3d5140', shape: 'oval' },
];
let selected = 0;
let landmarker;
let lastVideoTime = -1;

function glassesSvg(frame) {
  const round = frame.shape === 'round' || frame.shape === 'oval';
  const cat = frame.shape === 'cat';
  const left = cat ? 'M8 19 L18 8 L52 11 Q61 12 62 23 Q60 40 45 42 L20 40 Q10 37 8 19Z' : round ? 'M8 21 Q8 7 32 8 Q55 8 57 24 Q55 42 32 43 Q9 41 8 21Z' : 'M8 10 Q8 7 12 7 L52 7 Q57 7 57 12 L55 37 Q54 42 49 42 L16 42 Q10 41 10 36Z';
  return `<svg viewBox="0 0 112 55" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${frame.color}" stroke-width="3"><path d="${left}" transform="translate(0 0)"/><path d="${left}" transform="translate(54 0) scale(-1 1)"/><path d="M57 21 Q61 17 67 21"/><path d="M7 13 L1 10 M105 13 L111 10"/></g></svg>`;
}

function renderFramePicker() {
  frameList.innerHTML = frames.map((frame, index) => `<button class="frame-option ${index === selected ? 'selected' : ''}" data-index="${index}"><div class="frame-art">${glassesSvg(frame)}</div><span class="frame-label">${frame.name}</span><span class="frame-price">${frame.price}</span></button>`).join('');
  frameList.querySelectorAll('button').forEach(button => button.addEventListener('click', () => selectFrame(Number(button.dataset.index))));
}

function selectFrame(index) {
  selected = index;
  const frame = frames[index];
  frameName.textContent = frame.name;
  frameFinish.textContent = frame.finish;
  frameCount.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
  renderFramePicker();
}

function point(landmarks, index) { return landmarks[index]; }
function drawGlasses(landmarks) {
  const leftEye = point(landmarks, 33);
  const rightEye = point(landmarks, 263);
  const bridge = point(landmarks, 168);
  const width = Math.abs(rightEye.x - leftEye.x) * canvas.width;
  const x = ((leftEye.x + rightEye.x) / 2) * canvas.width;
  const y = bridge.y * canvas.height;
  const angle = Math.atan2((rightEye.y - leftEye.y) * canvas.height, (rightEye.x - leftEye.x) * canvas.width);
  const scale = Math.max(1, width / 112);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale); ctx.translate(-56, -22);
  const frame = frames[selected];
  ctx.strokeStyle = frame.color; ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.fillStyle = 'rgba(225,235,218,.08)';
  const shape = frame.shape === 'square' ? (cx) => { ctx.beginPath(); ctx.roundRect(cx, 5, 49, 35, 6); ctx.fill(); ctx.stroke(); } : (cx) => { ctx.beginPath(); ctx.ellipse(cx + 25, 22, 25, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  shape(2); shape(65); ctx.beginPath(); ctx.moveTo(51, 19); ctx.quadraticCurveTo(56, 15, 61, 19); ctx.moveTo(2, 12); ctx.lineTo(-8, 8); ctx.moveTo(114, 12); ctx.lineTo(124, 8); ctx.stroke();
  ctx.restore();
}

async function startCamera() {
  startButton.disabled = true; startButton.textContent = 'Loading camera...';
  try {
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    landmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1 });
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 960 }, audio: false });
    await video.play(); stage.classList.add('active'); status.textContent = 'Looking for your face'; resizeCanvas(); requestAnimationFrame(track);
  } catch (error) { startButton.disabled = false; startButton.textContent = 'Try again'; message.querySelector('span').textContent = 'Camera permission is needed to continue.'; console.error(error); }
}

function resizeCanvas() { canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480; }
function track() { if (video.readyState >= 2 && video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; const result = landmarker.detectForVideo(video, performance.now()); ctx.clearRect(0, 0, canvas.width, canvas.height); if (result.faceLandmarks?.[0]) { status.textContent = 'Face detected'; drawGlasses(result.faceLandmarks[0]); } else status.textContent = 'Looking for your face'; } requestAnimationFrame(track); }
captureButton.addEventListener('click', () => { const output = document.createElement('canvas'); output.width = video.videoWidth; output.height = video.videoHeight; const outputCtx = output.getContext('2d'); outputCtx.translate(output.width, 0); outputCtx.scale(-1, 1); outputCtx.drawImage(video, 0, 0); outputCtx.drawImage(canvas, 0, 0); const link = document.createElement('a'); link.download = 'speculate-try-on.png'; link.href = output.toDataURL('image/png'); link.click(); });
startButton.addEventListener('click', startCamera); window.addEventListener('resize', resizeCanvas); renderFramePicker();
