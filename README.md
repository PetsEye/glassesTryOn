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
- Live camera is mirrored like a mirror; uploaded photos are not.

## Tests

Pure geometry and image-processing logic lives in `src/` and is covered by
Node's built-in test runner:

```bash
npm test      # unit tests for fitting math and background removal
npm run check # syntax check for app.js
```

## External dependencies

Loaded from CDNs at runtime (no build step, no server):

- `@mediapipe/tasks-vision` (Face Landmarker) via jsDelivr.
- The face landmark model `.task` from Google Cloud Storage.
- Google Fonts (Manrope, DM Mono).

All camera frames, photos, and landmarks stay in the browser.
