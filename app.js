import {
  computeGlassesTransform,
  computeTempleGeometry,
  estimateYaw,
  midpoint,
  rgbToCss,
} from './src/geometry.js?v=0.4';
import { averageColor, prepareGlassesData } from './src/image-processing.js?v=0.4';
import { createPresetFrames } from './src/frames.js?v=0.4';

const TASKS_VERSION = '0.10.20';
const CDN = {
  tasksEsm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/+esm`,
  tasksBundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`,
  vision: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`,
  model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

async function loadTasks() {
  const candidates = [CDN.tasksEsm, CDN.tasksBundle];
  let lastError;
  for (const url of candidates) {
    try {
      const module = await import(url);
      if (module.FaceLandmarker && module.FilesetResolver) return module;
      lastError = new Error(`Missing exports from ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Could not load the face model library');
}

const IRIS_LEFT = 468;
const IRIS_RIGHT = 473;
const BRIDGE = 168;
const EAR_LEFT = 234;
const EAR_RIGHT = 454;
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
const scene3d = document.querySelector('#scene3d');
const modelInput = document.querySelector('#modelInput');
const modelDrop = document.querySelector('#modelDrop');

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
  three: null,
  modelLoaded: false,
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
    if (frame.sprite) {
      frame.sprite.classList.add('frame-thumb');
      art.appendChild(frame.sprite);
    } else {
      const badge = document.createElement('span');
      badge.className = 'frame-art-3d';
      badge.textContent = '3D';
      art.appendChild(badge);
    }

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
    const color = averageColor(prepared.data);
    return { sprite, color };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addGlassesFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    setStatus('Preparing frames');
    const { sprite, color } = await fileToSprite(file);
    const uploadIndex = state.frames.filter((frame) => frame.kind === 'upload').length + 1;
    state.frames.push({
      id: `upload-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 22) || `Uploaded ${uploadIndex}`,
      finish: 'Uploaded image',
      price: 'Custom',
      kind: 'upload',
      sprite,
      templeColor: rgbToCss(color),
      hingeLeftX: 0.02,
      hingeRightX: 0.98,
      hingeY: 0.45,
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
    const { FaceLandmarker, FilesetResolver } = await loadTasks();
    const vision = await FilesetResolver.forVisionTasks(CDN.vision);
    state.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: CDN.model, delegate: 'GPU' },
      runningMode: mode,
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
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

function spritePointToCanvas(transform, x, y) {
  const dx = (x - transform.spriteBridgeX) * transform.scale;
  const dy = (y - transform.spriteEyeY) * transform.scale;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  return {
    x: transform.anchorX + dx * cos - dy * sin,
    y: transform.anchorY + dx * sin + dy * cos,
  };
}

function drawTemple(hinge, ear, side, yaw, thickness, color) {
  const geometry = computeTempleGeometry({ hinge, ear, side, yaw, thickness });
  ctx.save();
  ctx.globalAlpha = geometry.alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = geometry.width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(geometry.start.x, geometry.start.y);
  ctx.lineTo(geometry.end.x, geometry.end.y);
  ctx.stroke();
  ctx.restore();
}

function drawTemples(landmarks, transform, frame) {
  const earLeft = landmarks[EAR_LEFT];
  const earRight = landmarks[EAR_RIGHT];
  if (!earLeft || !earRight) return;

  const yaw = estimateYaw({ nose: landmarks[1] || landmarks[BRIDGE], leftEdge: earLeft, rightEdge: earRight });
  const leftNear = (earLeft.z ?? 0) <= (earRight.z ?? 0);
  const hingeY = (frame.hingeY ?? frame.defaultAnchorY) * frame.sprite.height;
  const leftHinge = spritePointToCanvas(transform, (frame.hingeLeftX ?? 0.02) * frame.sprite.width, hingeY);
  const rightHinge = spritePointToCanvas(transform, (frame.hingeRightX ?? 0.98) * frame.sprite.width, hingeY);
  const leftEar = { x: earLeft.x * canvas.width, y: earLeft.y * canvas.height };
  const rightEar = { x: earRight.x * canvas.width, y: earRight.y * canvas.height };
  const thickness = Math.max(2, frame.sprite.height * transform.scale * 0.05);
  const color = frame.templeColor || '#17181a';

  drawTemple(leftHinge, leftEar, leftNear ? 'near' : 'far', yaw, thickness, color);
  drawTemple(rightHinge, rightEar, leftNear ? 'far' : 'near', yaw, thickness, color);
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

  drawTemples(landmarks, transform, frame);

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

function is3DFrame() {
  return activeFrame()?.kind === 'model3d';
}

async function ensureThree() {
  if (state.three) return state.three;
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const renderer = new THREE.WebGLRenderer({ canvas: scene3d, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 5000);
  camera.position.z = 0;
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(0, 0, 1);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
  fillLight.position.set(0, 0, -1);
  scene.add(fillLight);
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const pivot = new THREE.Group();
  group.add(pivot);
  scene.add(group);
  state.three = { THREE, GLTFLoader, renderer, scene, camera, group, pivot, baseScale: 1 };
  return state.three;
}

async function addModel3D(file) {
  if (!file) return;
  try {
    setStatus('Loading 3D model');
    const three = await ensureThree();
    const url = URL.createObjectURL(file);
    let gltf;
    try {
      gltf = await new three.GLTFLoader().loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    three.pivot.clear();
    gltf.scene.traverse((node) => {
      node.frustumCulled = false;
    });
    three.pivot.add(gltf.scene);

    const box = new three.THREE.Box3().setFromObject(gltf.scene);
    const size = new three.THREE.Vector3();
    const center = new three.THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    gltf.scene.position.sub(center);
    three.baseScale = 14 / Math.max(size.x, 0.0001);
    state.modelLoaded = true;

    const existing = state.frames.findIndex((frame) => frame.kind === 'model3d');
    const frame = {
      id: `model-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 22) || '3D model',
      finish: '3D model',
      price: 'Custom',
      kind: 'model3d',
      defaultSpread: 0.215,
      defaultAnchorY: 0.5,
    };
    if (existing >= 0) state.frames[existing] = frame;
    else state.frames.push(frame);
    state.selected = existing >= 0 ? existing : state.frames.length - 1;
    resetFitForFrame();
    renderFrameList();
    updateDetails();
    if (state.mode === 'photo') renderPhoto();
    setStatus('3D model ready');
  } catch (error) {
    console.error(error);
    setStatus('Could not load that model');
  }
}

function render3D(result) {
  const three = state.three;
  if (!three || !state.modelLoaded) return;
  const matrix = result?.facialTransformationMatrixes?.[0]?.data;
  if (matrix) {
    const m = new three.THREE.Matrix4().fromArray(matrix);
    m.scale(new three.THREE.Vector3(100, 100, 100));
    three.group.matrix.copy(m);
  }
  three.pivot.scale.setScalar(three.baseScale * state.fit.scale);
  three.pivot.position.set(0, state.fit.yOffset * 30, 0);
  const width = canvas.width;
  const height = canvas.height;
  if (canvas.width !== scene3d.width || canvas.height !== scene3d.height) {
    three.renderer.setSize(width, height, false);
    three.camera.aspect = width / height;
    three.camera.updateProjectionMatrix();
  }
  three.renderer.render(three.scene, three.camera);
}

function renderDetection(result) {
  updateFaceStatus(result);
  if (is3DFrame()) {
    scene3d.style.display = 'block';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    render3D(result);
  } else {
    scene3d.style.display = 'none';
    drawGlasses(result);
  }
}

function loop() {
  if (state.mode === 'camera' && state.cameraReady && state.landmarker && video.readyState >= 2) {
    if (video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = video.currentTime;
      const result = state.landmarker.detectForVideo(video, performance.now());
      renderDetection(result);
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
  renderDetection(result);
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
  const overlaySource = is3DFrame() && state.three && state.modelLoaded ? scene3d : canvas;
  outputCtx.drawImage(overlaySource, 0, 0, width, height);

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

  modelInput.addEventListener('change', () => {
    if (modelInput.files?.[0]) addModel3D(modelInput.files[0]);
    modelInput.value = '';
  });
  ['dragenter', 'dragover'].forEach((type) =>
    modelDrop.addEventListener(type, (event) => {
      event.preventDefault();
      modelDrop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    modelDrop.addEventListener(type, (event) => {
      event.preventDefault();
      modelDrop.classList.remove('over');
    }),
  );
  modelDrop.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) addModel3D(file);
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
