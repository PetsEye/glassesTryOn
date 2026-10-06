# Speculate

An open-source, local-first glasses try-on tool. Upload a picture of any pair of
glasses and see it fitted over your own face in a live camera preview or on a
photo, without giving up your facial features.

## Run it

Camera access requires a secure context. From this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## How fitting works

- MediaPipe Face Landmarker detects the pupils and nose bridge each frame.
- The uploaded glasses image is processed on-device: the background is removed
  (color-keyed from the corners, or preserved if the image already has alpha)
  and the sprite is cropped tight to the frames.
- The sprite is scaled so its lens centers line up with your pupils, rotated to
  match eye roll, and anchored at the bridge. Size, lens spread, and height are
  adjustable in the sidebar.
- Because a front-view photo has no temples, the app draws synthetic temple arms
  from the frame hinges to the ear landmarks, extending the near side and fading
  the far side as the head turns (yaw is estimated from the nose between the face
  edges).
- Live camera is mirrored like a mirror; uploaded photos are not.

## Optional 3D models (experimental)

You can also import a `.glb`/`.gltf` glasses model. It is rendered with Three.js
using MediaPipe's facial transformation matrix, so it gets real side views and
perspective. This path is experimental: it works best with models authored for
MediaPipe's canonical face space (centered, roughly centimeter scale); the app
auto-centers and scales the model but you may still need to nudge the fit sliders.
If no model is loaded, the image workflow is unaffected.

## Tests

Pure geometry and image-processing logic lives in `src/` and is covered by
Node's built-in test runner:

```bash
npm test      # unit tests for fitting math and background removal
npm run check # syntax check for app.js
```

## External dependencies

Loaded from CDNs at runtime (no build step, no server):

- `@mediapipe/tasks-vision@0.10.20` (`+esm` build + wasm) via jsDelivr.
- The face landmark model `.task` from Google Cloud Storage.
- `three@0.160.0` and its `GLTFLoader`, loaded lazily only when you import a 3D model.
- Google Fonts (Manrope, DM Mono).

All camera frames, photos, and landmarks stay in the browser.
