# SpliceGPT V1 engine refactor replacement files

Replace these files in your GitHub repo with the matching files in this bundle:

- `src/engine/groupRouting.ts`
- `src/engine/routing.ts`
- `src/components/SpliceCanvas.tsx`

No `App.tsx` change is required. The app already imports `SpliceCanvas`, and this replacement keeps the same exported component name.

Expected visible change after deploy:

- canvas label changes from `splice routing center` to `nested center routing`
- debug panel says `nested routes`
- imported routes use the nested fiber-group route planner
- live cable dragging reroutes with `applyNestedLiveRoutes(...)`
