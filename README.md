# Speculate

An open-source, local-first glasses try-on prototype.

## Run it

Camera access requires a secure context. From this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The first load downloads MediaPipe and its face landmark model from their CDNs. The camera stream and face landmarks remain in the browser.
