# SpliceGPT React Flow Prototype

A front-end-only React prototype for deterministic fiber splice-detail creation.

## Current prototype direction

This revision uses a hybrid canvas:

- React Flow provides pan, zoom, controls, selection, and cable node dragging.
- The custom splice engine still owns the canonical model, layout, and route plan.
- A custom SVG viewport overlay renders fiber splice routes from the route plan.
- Custom React Flow cable nodes render small sheath/cylinder visuals, buffer tubes, and fiber fan-out stubs.

## Important architecture rule

React Flow is the interaction shell. It is not the source of truth for fiber routing.

```txt
CSV/model + manual overrides
  -> layout engine
  -> routing engine
  -> React Flow cable nodes + SVG route overlay
```

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL, usually `http://localhost:5173/`.

## Deploy

GitHub Pages is deployed by `.github/workflows/deploy.yml`. Set Pages source to **GitHub Actions**.
