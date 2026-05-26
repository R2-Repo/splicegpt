# SpliceGPT refactor build plan

Reference repo is read-only. This plan applies only to splicegpt.

## Target

CSV -> diagnostics -> model -> layout -> routing -> React Flow shell + SVG overlay -> future PDF export.

React Flow is interaction only. The engine owns model, layout, and routing.

## Priorities

1. Fix Bentley CSV semantics. Left rows create splice pairs. Right rows are hints only.
2. Normalize blank To fiber numbers without shifting tube/fiber columns.
3. Keep cable leg identity separate from display cable name.
4. Use fixed TIA layout rules: 24px fiber pitch, 8px tube gap, 32px cable gap.
5. Keep cable visuals compact: sheath, buffer tube fan-outs, fiber fan-outs, black fusion dots.
6. Store manual edit intent, not raw SVG route paths.
7. Add fixture checks before PDF/export work.

## Current branch slice

- Parser correction for Left/Right Bentley sections.
- Better blank To fiber handling.
- Role-scoped Bentley cable legs.
- 24px layout and routing pitch.
- Black fusion splice dots.
