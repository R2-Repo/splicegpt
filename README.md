# Splice Routing Prototype

A small front-end-only React prototype for a deterministic splice-detail canvas.

This is intentionally separate from your existing GitHub repo. It is meant as a clean reference architecture, not a drop-in replacement.

## What it demonstrates

- CSV import
- Canonical splice model
- Deterministic cable layout
- Full-diagram strand rerouting after every manual drag
- Simple SVG canvas renderer
- Cable drag overrides
- Click-to-mark protected/existing routes
- Basic route diagnostics
- Engine-first structure that is easy to extend

## Run locally

Requirements:

- Node.js 20 or newer
- npm

From this folder:

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, usually:

```txt
http://localhost:5173/
```

To stop the local server, press:

```txt
Ctrl + C
```

## Deploy to GitHub Pages

This zip includes a GitHub Actions workflow at:

```txt
.github/workflows/deploy.yml
```

Steps:

1. Create a new GitHub repo.
2. Upload all files from this folder to the repo.
3. Commit to the `main` branch.
4. In GitHub, go to **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to **GitHub Actions**.
6. Go to **Actions** and run/wait for **Deploy GitHub Pages**.
7. Open the Pages URL GitHub gives you.

The Vite config uses:

```ts
base: "./"
```

That allows the app to work from a GitHub Pages project URL like:

```txt
https://your-username.github.io/your-repo-name/
```

## Supported CSV format

The easiest format is:

```csv
sourceCable,sourceTube,sourceFiber,sourceFiberColor,targetCable,targetTube,targetFiber,targetFiberColor,circuit
FEEDER-288,BL,1,BL,DIST-A-144,BL,1,BL,CH 101
```

There is also a lightweight Bentley-like parser for rows containing `<->`, but it is intentionally simple. The main point of this prototype is the engine shape.

## Engine structure

```txt
src/engine/
  types.ts          shared model, layout, routing types
  colors.ts         TIA colors and normalization
  parseCsv.ts       CSV and Bentley-like parser
  layout.ts         deterministic cable/fiber layout
  routing.ts        full-diagram routing engine
  buildDiagram.ts   pipeline wrapper
```

The important pattern is:

```txt
CSV text
  -> parseSpliceCsv()
  -> SpliceModel
  -> createLayoutPlan(model, overrides)
  -> routeSpliceStrands(model, layout, overrides)
  -> render
```

Manual edits only update `DiagramOverrides`. They do not directly edit SVG route geometry.

## Key design rule

Every edit reroutes the entire diagram. Do not route only the cable that was moved.

```txt
model + overrides -> full layout -> full route plan -> render
```

That is the main difference from a fragile canvas state approach.
