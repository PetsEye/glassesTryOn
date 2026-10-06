# AGENTS.md

## Project Goal

Build an open-source, browser-based glasses try-on tool. The core experience should let a user provide an image of glasses and see those glasses fitted over their own face while preserving their facial features.

The preferred product direction is:

- Use face landmarks and head pose to preserve the user's real face.
- Support a live camera preview first, then uploaded user photos.
- Accept a glasses image as an input, remove or ignore its background, and align the glasses to the user's eye line, bridge, and face width.
- Keep camera images and face data local to the browser whenever practical.
- Treat generative AI as an optional enhancement, not the source of truth for geometric fit.

## Current Prototype

A dependency-light static web app (no build step) with two fitting paths:

- Image path (default): upload a glasses photo, background is removed on-device, and the sprite is fitted to face landmarks.
- Optional 3D path (experimental): import a `.glb`/`.gltf` model, placed with MediaPipe's facial transformation matrix.

It supports live camera and photo modes, built-in preset frames, fit sliders, synthetic temple arms, and screenshot export.

Run it locally with:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser with camera support (must be `localhost` or https; `file://` blocks ES modules and the camera).

## Architecture

File map:

- `index.html` - markup and the `three` import map. No build step.
- `styles.css` - the only stylesheet.
- `app.js` - orchestration: camera/photo sources, landmarker lifecycle, rendering, UI events.
- `src/geometry.js` - pure fitting math: glasses transform, yaw, temple geometry. Unit-tested.
- `src/image-processing.js` - pure RGBA helpers: background key, trim, average color. Unit-tested.
- `src/frames.js` - built-in preset frame sprites drawn with the canvas 2D API.
- `test/*.test.js` - `node:test` suites.

Rules:

- Pure logic lives in `src/` and must stay DOM-free so `node --test` can run it.
- `app.js` is the only file that touches the DOM, canvas, or CDN.
- Keep external CDN dependencies documented in `README.md`.

## How Fitting Works

### Landmarks

- Face Landmarker returns 478 landmarks (x/y normalized, z relative depth).
- Pupils (iris centers `468`/`473`) drive scale and eye roll; if iris landmarks are missing or degraded, fall back to eyelid midpoints (`33`/`133` and `362`/`263`).
- `168` (nose bridge), `234`/`454` (ears), and `1` (nose tip) drive anchoring, temples, and yaw.

### Transform

- `computeGlassesTransform` maps the sprite's lens-center span onto the pupil distance, rotates by eye roll, and anchors at the eye midpoint with a slider-driven vertical offset.
- Horizontal foreshortening comes for free: the projected pupil distance shrinks with yaw, so the frame narrows as the head turns.
- Lens centers default to 27%/73% of sprite width; adjust with the Size, Lens spread, and Height sliders.

### Temples (2D, default)

- A front-view photo has no stems, so `drawTemples` draws arms from the frame hinge points to the ear landmarks.
- Yaw is estimated by `estimateYaw` from the nose between the two face edges. The near arm (smaller z) extends past the ear; the far arm is shortened and faded.
- The temple color is the average color of the uploaded sprite (`averageColor`), so it blends with the frame.

### Background Removal

- If the image already has alpha, keep it; otherwise color-key from the most uniform corner and crop to the visible glasses.
- The result is a tightly-cropped transparent sprite used for fitting and the frame picker.

### 3D Path (optional, experimental)

- Three.js and `GLTFLoader` are lazy-loaded only when a model is imported (import map in `index.html`); the image path never depends on them.
- The landmarker runs with `outputFacialTransformationMatrixes: true`.
- Each detection: `Matrix4.fromArray(matrix).scale(100)` is applied to a group; the camera is `PerspectiveCamera(60, aspect, 0.01, 5000)` at the origin looking down -Z.
- The model is auto-centered and scaled to roughly 14cm. Fit sliders adjust scale and height. It works best with models authored in MediaPipe's canonical face space and may still need tuning.

## Conventions And Gotchas

- Pin CDN versions, and verify a version exists (`curl` the URL) before pinning. `@mediapipe/tasks-vision@0.10.22` was never published and silently broke the whole app.
- Load MediaPipe with a dynamic `import()`; the UI and glasses upload must keep working if the model CDN is unavailable or slow.
- Cache-bust changed local modules with `?v=` and bump the visible footer version so stale caches are obvious.
- Live camera and its overlay are CSS-mirrored (`scaleX(-1)`); photos are not. Keep all drawing coordinates in unmirrored source space.
- Iris landmarks can be absent or jittery, especially when the user already wears glasses: keep the eye-corner fallback and the on-screen hint to remove existing glasses.
- Never send camera frames, landmarks, or uploaded images to a server.

## Development Rules

- Make the smallest correct change that moves the try-on experience forward.
- Keep the app usable on desktop and mobile.
- Do not upload camera frames or face landmarks to a server without an explicit product decision and user consent.
- Prefer deterministic landmark-based placement for glasses fit.
- Use generated or sample assets only when their licensing is clear.
- Do not commit secrets, API keys, private images, or camera captures.

## Testing And Commit Cadence

Test frequently and commit frequently. Before each commit:

1. Run `npm run check` (syntax) and `npm test` (geometry and image-processing units).
2. Start the local server and manually exercise the affected features (camera permission, face detection, frame switching, glasses upload, fit sliders, photo mode, screenshot export).
3. Inspect `git diff` and `git status` to ensure only intended files are included.
4. Commit one coherent change with a concise message.

For changes to image-based fitting, test at minimum with:

- A front-facing face in even lighting.
- A slight left and right head turn (check the near temple extends and the far temple fades).
- Different face widths and glasses aspect ratios.
- An image with a transparent background and one with a plain background.
- Camera denial and missing-face states.

For the 3D path, additionally check:

- Importing a `.glb` loads without console errors and appears over the face.
- Head rotation tracks plausibly and the model orientation is correct.
- Switching between camera/photo and 2D/3D frames leaves no stale overlay.

Automated tests cover the pure `src/` modules only. Rendering, tracking, camera, and 3D alignment require manual browser checks.

## Near-Term Implementation Sequence

Done:

1. Glasses image upload flow with on-device background removal (`src/image-processing.js`).
2. Normalization and trimming to frame bounds; lens centers default to the middle quarters.
3. Landmark-based fitting: pupil distance drives scale, eye roll drives rotation (`src/geometry.js`).
4. Synthetic temple arms anchored to ear landmarks with yaw-based near/far visibility.
5. Photo upload mode alongside the live camera.
6. Automated geometry and image-processing tests (`npm test`).
7. Optional 3D `.glb` path via Three.js and the facial transformation matrix.

Next:

1. Auto-detect lens centers from the uploaded image instead of the 27%/73% default.
2. Improve the optional 3D `.glb` path (model placement/orientation tuning for canonical face space).
3. Optional backend or generative enhancement only after the deterministic fit is solid.
