# SpliceGPT SVG Engine Prototype

A front-end-only React prototype for deterministic fiber splice-detail creation.

## Current prototype direction

This revision intentionally keeps the UI simple:

- top import bar only
- SVG splice canvas
- small cable sheath/cylinder visuals
- buffer tube fan-out lines
- fiber strand fan-out lines
- deterministic full-diagram reroute after every cable drag

The goal is to prove the splice engine before wrapping it in a heavier React Flow editor.

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL, usually `http://localhost:5173/`.

## Deploy

GitHub Pages is deployed by `.github/workflows/deploy.yml`. Set Pages source to **GitHub Actions**.
