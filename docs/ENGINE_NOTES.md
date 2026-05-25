# Engine Notes

## Goal

Keep the splice detail deterministic, testable, and exportable.

React is only the editor/view. The splice engine owns correctness.

## Recommended future modules

```txt
src/engine/model/
  normalizeBentleyCsv.ts
  buildCanonicalModel.ts

src/engine/layout/
  cablePlacement.ts
  rowPlacement.ts
  tubePlacement.ts

src/engine/routing/
  routeZones.ts
  lanePacking.ts
  pathTemplates.ts
  routeValidation.ts

src/engine/render/
  toReactFlow.ts
  toSvg.ts
  toPdf.ts
```

## Manual edit philosophy

Do not persist raw route geometry. Persist user intent.

Good overrides:

```ts
type DiagramOverrides = {
  cableOverrides: Record<CableId, {
    side?: "left" | "right";
    position?: { x: number; y: number };
    order?: number;
  }>;
  protectedConnectionIds: Record<ConnectionId, boolean>;
};
```

Avoid overrides like:

```ts
svgPath: "M 1 2 L 3 4 ..."
```

Raw paths become stale as soon as another cable moves.

## Routing rules to add next

- Bundle 12-fiber tube splices into shared trunks.
- Support collapsed full butt splices.
- Detect and repair horizontal segment overlaps.
- Add label collision avoidance.
- Add auto-width expansion when lanes become too tight.
- Add regression tests for drag scenarios.
