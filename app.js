import { computeGlassesTransform, midpoint } from './src/geometry.js';
import { prepareGlassesData } from './src/image-processing.js';
import { createPresetFrames } from './src/frames.js';

const TASKS_VERSION = '0.10.20';
const CDN = {
  tasksEsm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`,
  vision: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`,
  model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

const IRIS_LEFT = 468;
const IRIS_RIGHT = 473;
const BRIDGE = 168;
const MAX_SPRITE = 900;

const video = document.querySelector('#camera');
const photo = document.querySelector('#photo');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('#stage');
const message = document.querySelector('#stageMessage');
const startButton = document.querySelector('#startButton');
const photoStartButton = document.querySelector('#photoStartButton');
const captureButton = document.querySelector('#captureButton');
const status = document.querySelector('#statusPill span');
const frameList = document.querySelector('#frameList');
const frameName = document.querySelector('#frameName');
const frameFinish = document.querySelector('#frameFinish');
const frameCount = document.querySelector('#frameCount');
const glassesInput = document.querySelector('#glassesInput');
const glassesDrop = document.querySelector('#glassesDrop');
const photoInput = document.querySelector('#photoInput');
const modeCamera = document.querySelector('#modeCamera');
const modePhoto = document.querySelector('#modePhoto');
const fitSize = document.querySelector('#fitSize');
const fitSpread = document.querySelector('#fitSpread');
const fitHeight = document.querySelector('#fitHeight');
const resetFit = document.querySelector('#resetFit');

const state = {
  frames: [],
  selected: 0,
  fit: { scale: 1, spread: 0.215, yOffset: 0 },
  mode: 'camera',
  landmarker: null,
  runningMode: null,
  lastVideoTime: -1,
  cameraStream: null,
  cameraReady: false,
  photoUrl: null,
  messageSpan: message.querySelector('span'),
};

function activeFrame() {
  return state.frames[state.selected];
}

function setStatus(text) {
  status.textContent = text;
}

function setMessage(text) {
  if (state.messageSpan) state.messageSpan.textContent = text;
}

function bindFitControls() {
  fitSize.value = state.fit.scale;
  fitSpread.value = state.fit.spread;
  fitHeight.value = state.fit.yOffset;
}

function applyFitFromControls() {
  state.fit.scale = Number(fitSize.value);
  state.fit.spread = Number(fitSpread.value);
  state.fit.yOffset = Number(fitHeight.value);
  if (state.mode === 'photo') renderPhoto();
}

function resetFitForFrame() {
  const frame = activeFrame();
  state.fit.scale = 1;
  state.fit.spread = frame ? frame.defaultSpread : 0.215;
  state.fit.yOffset = 0;
  bindFitControls();
}

function updateDetails() {
  const frame = activeFrame();
  if (!frame) return;
  frameName.textContent = frame.name;
  frameFinish.textContent = frame.finish;
  frameCount.textContent = `${String(state.selected + 1).padStart(2, '0')} / ${String(state.frames.length).padStart(2, '0')}`;
}

function renderFrameList() {
  frameList.innerHTML = '';
  state.frames.forEach((frame, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `frame-option${index === state.selected ? ' selected' : ''}`;
    button.dataset.index = String(index);

    const art = document.createElement('div');
    art.className = 'frame-art';
    frame.sprite.classList.add('frame-thumb');
    art.appendChild(frame.sprite);

    const label = document.createElement('span');
    label.className = 'frame-label';
    label.textContent = frame.name;

    const price = document.createElement('span');
    price.className = 'frame-price';
    price.textContent = frame.price;

    button.append(art, label, price);
    button.addEventListener('click', () => selectFrame(index));
    frameList.appendChild(button);
  });
}

function selectFrame(index) {
  state.selected = index;
  resetFitForFrame();
  updateDetails();
  renderFrameList();
  if (state.mode === 'photo') renderPhoto();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function fileToSprite(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const ratio = Math.min(1, MAX_SPRITE / (image.naturalWidth || 1));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    const workCtx = work.getContext('2d', { willReadFrequently: true });
    workCtx.drawImage(image, 0, 0, width, height);
    const imageData = workCtx.getImageData(0, 0, width, height);
    const prepared = prepareGlassesData(imageData.data, width, height);
    if (!prepared) throw new Error('No glasses detected in that image');

    const sprite = document.createElement('canvas');
    sprite.width = prepared.width;
    sprite.height = prepared.height;
    sprite.getContext('2d').putImageData(
      new ImageData(prepared.data, prepared.width, prepared.height),
      0,
      0,
    );
    return sprite;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addGlassesFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    setStatus('Preparing frames');
    const sprite = await fileToSprite(file);
    const uploadIndex = state.frames.filter((frame) => frame.kind === 'upload').length + 1;
    state.frames.push({
      id: `upload-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 22) || `Uploaded ${uploadIndex}`,
      finish: 'Uploaded image',
      price: 'Custom',
      kind: 'upload',
      sprite,
      defaultSpread: 0.27,
      defaultAnchorY: 0.45,
    });
    selectFrame(state.frames.length - 1);
    setStatus(state.mode === 'photo' ? 'Frame applied' : 'Looking for your face');
  } catch (error) {
    console.error(error);
    setStatus('Could not read that image');
  }
}

async function ensureLandmarker(mode) {
  if (!state.landmarker) {
    const { FaceLandmarker, FilesetResolver } = await import(CDN.tasksEsm);
    const vision = await FilesetResolver.forVisionTasks(CDN.vision);
    state.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: CDN.model, delegate: 'GPU' },
      runningMode: mode,
      numFaces: 1,
    });
    state.runningMode = mode;
    return;
  }
  if (state.runningMode !== mode) {
    await state.landmarker.setOptions({ runningMode: mode });
    state.runningMode = mode;
  }
}

function resizeCanvasTo(width, height) {
  if (!width || !height) return;
  canvas.width = width;
  canvas.height = height;
}

function drawGlasses(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const landmarks = result?.faceLandmarks?.[0];
  const frame = activeFrame();
  if (!landmarks || !frame) return false;

  const leftEye = landmarks[IRIS_LEFT] || midpoint(landmarks[33], landmarks[133]);
  const rightEye = landmarks[IRIS_RIGHT] || midpoint(landmarks[362], landmarks[263]);
  if (!leftEye || !rightEye) return false;

  const transform = computeGlassesTransform({
    leftEye,
    rightEye,
    bridge: landmarks[BRIDGE],
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    spriteWidth: frame.sprite.width,
    spriteHeight: frame.sprite.height,
    spread: state.fit.spread,
    verticalAnchor: frame.defaultAnchorY,
    scale: state.fit.scale,
    yOffset: state.fit.yOffset,
  });

  ctx.save();
  ctx.translate(transform.anchorX, transform.anchorY);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(frame.sprite, -transform.spriteBridgeX, -transform.spriteEyeY);
  ctx.restore();
  return true;
}

function updateFaceStatus(result) {
  const detected = Boolean(result?.faceLandmarks?.[0]);
  setStatus(detected ? 'Face detected' : 'Looking for your face');
}

function loop() {
  if (state.mode === 'camera' && state.cameraReady && state.landmarker && video.readyState >= 2) {
    if (video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = video.currentTime;
      const result = state.landmarker.detectForVideo(video, performance.now());
      drawGlasses(result);
      updateFaceStatus(result);
    }
  }
  requestAnimationFrame(loop);
}

async function startCamera() {
  startButton.disabled = true;
  startButton.textContent = 'Starting...';
  try {
    await ensureLandmarker('VIDEO');
    if (!state.cameraStream) {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 960 },
        audio: false,
      });
      video.srcObject = state.cameraStream;
      await video.play();
    }
    state.mode = 'camera';
    state.cameraReady = true;
    photo.style.display = 'none';
    stage.classList.add('active');
    stage.classList.remove('photo-mode');
    modeCamera.classList.add('selected');
    modePhoto.classList.remove('selected');
    resizeCanvasTo(video.videoWidth, video.videoHeight);
    setStatus('Looking for your face');
    if (!state.loopStarted) {
      state.loopStarted = true;
      requestAnimationFrame(loop);
    }
  } catch (error) {
    console.error(error);
    startButton.disabled = false;
    startButton.textContent = 'Try again';
    setMessage('Camera permission is needed to continue.');
  }
}

async function showPhoto(image) {
  photo.src = image.src;
  photo.style.display = 'block';
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    state.cameraReady = false;
  }
  state.mode = 'photo';
  stage.classList.add('active', 'photo-mode');
  modePhoto.classList.add('selected');
  modeCamera.classList.remove('selected');
  try {
    await ensureLandmarker('IMAGE');
    resizeCanvasTo(image.naturalWidth, image.naturalHeight);
    renderPhoto();
  } catch (error) {
    console.error(error);
    setStatus('Could not load face model');
    setMessage('Could not load the face model. Check your connection and try again.');
  }
}

async function usePhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = URL.createObjectURL(file);
  const image = await loadImage(state.photoUrl);
  await showPhoto(image);
}

function renderPhoto() {
  if (state.mode !== 'photo' || !state.landmarker || !photo.complete) return;
  const result = state.landmarker.detect(photo);
  drawGlasses(result);
  updateFaceStatus(result);
}

function capture() {
  const usingPhoto = state.mode === 'photo';
  const source = usingPhoto ? photo : video;
  const width = usingPhoto ? photo.naturalWidth : video.videoWidth;
  const height = usingPhoto ? photo.naturalHeight : video.videoHeight;
  if (!width || !height) return;

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext('2d');
  if (!usingPhoto) {
    outputCtx.translate(width, 0);
    outputCtx.scale(-1, 1);
  }
  outputCtx.drawImage(source, 0, 0, width, height);
  outputCtx.drawImage(canvas, 0, 0, width, height);

  const link = document.createElement('a');
  link.download = 'speculate-try-on.png';
  link.href = output.toDataURL('image/png');
  link.click();
}

function openPhotoPicker() {
  photoInput.click();
}

function surfaceError(error) {
  console.error(error);
  const text = error instanceof Error ? error.message : String(error);
  setStatus('Something went wrong');
  setMessage(`Something went wrong: ${text}`);
}

function init() {
  window.addEventListener('error', (event) => surfaceError(event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => surfaceError(event.reason));

  try {
    state.frames = createPresetFrames();
  } catch (error) {
    console.error(error);
  }
  renderFrameList();
  updateDetails();
  bindFitControls();

  startButton.addEventListener('click', startCamera);
  photoStartButton.addEventListener('click', openPhotoPicker);
  captureButton.addEventListener('click', capture);
  resetFit.addEventListener('click', () => {
    resetFitForFrame();
    if (state.mode === 'photo') renderPhoto();
  });

  [fitSize, fitSpread, fitHeight].forEach((input) => input.addEventListener('input', applyFitFromControls));

  modeCamera.addEventListener('click', startCamera);
  modePhoto.addEventListener('click', () => {
    if (state.photoUrl) {
      loadImage(state.photoUrl).then(showPhoto);
    } else {
      openPhotoPicker();
    }
  });

  photoInput.addEventListener('change', () => {
    if (photoInput.files?.[0]) usePhotoFile(photoInput.files[0]);
    photoInput.value = '';
  });

  glassesInput.addEventListener('change', () => {
    if (glassesInput.files?.[0]) addGlassesFile(glassesInput.files[0]);
    glassesInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) =>
    glassesDrop.addEventListener(type, (event) => {
      event.preventDefault();
      glassesDrop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    glassesDrop.addEventListener(type, (event) => {
      event.preventDefault();
      glassesDrop.classList.remove('over');
    }),
  );
  glassesDrop.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) addGlassesFile(file);
  });

  window.addEventListener('resize', () => {
    if (state.mode === 'camera') resizeCanvasTo(video.videoWidth, video.videoHeight);
  });
}

init();
