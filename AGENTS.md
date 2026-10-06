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

The current prototype is a dependency-light static web app using MediaPipe Face Landmarker loaded from a CDN. It has a live camera preview, procedural frame placeholders, frame selection, and screenshot export.

Run it locally with:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser with camera support.

## Development Rules

- Make the smallest correct change that moves the try-on experience forward.
- Keep the app usable on desktop and mobile.
- Do not upload camera frames or face landmarks to a server without an explicit product decision and user consent.
- Prefer deterministic landmark-based placement for glasses fit.
- Use generated or sample assets only when their licensing is clear.
- Keep external CDN dependencies documented in `README.md`.
- Do not commit secrets, API keys, private images, or camera captures.

## Testing And Commit Cadence

Test frequently and commit frequently. Before each commit:

1. Run `npm run check` (syntax) and `npm test` (geometry and image-processing units).
2. Start the local server and manually test camera permission, face detection, frame switching, glasses upload, fit sliders, photo mode, and screenshot export when the change affects the UI or tracking.
3. Inspect `git diff` and `git status` to ensure only intended files are included.
4. Commit one coherent change with a concise message.

For changes to image-based fitting, test at minimum with:

- A front-facing face in even lighting.
- A slight left and right head turn.
- Different face widths and glasses aspect ratios.
- An image with a transparent background and one with a plain background.
- Camera denial and missing-face states.

## Near-Term Implementation Sequence

Done:

1. Glasses image upload flow with on-device background removal (`src/image-processing.js`).
2. Normalization and trimming to frame bounds; lens centers default to the middle quarters.
3. Landmark-based fitting: pupil distance drives scale, eye roll drives rotation (`src/geometry.js`).
4. Synthetic temple arms anchored to ear landmarks with yaw-based near/far visibility.
5. Photo upload mode alongside the live camera.
6. Automated geometry and image-processing tests (`npm test`).

Next:

1. Auto-detect lens centers from the uploaded image instead of the 27%/73% default.
2. Improve the optional 3D `.glb` path (model placement/tuning for canonical face space).
3. Optional backend or generative enhancement only after the deterministic fit is solid.
