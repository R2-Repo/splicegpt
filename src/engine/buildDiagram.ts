import { createLayoutPlan } from "./layout";
import { routeSpliceStrands } from "./routing";
import type { DiagramOverrides, LayoutPlan, RoutePlan, SpliceModel } from "./types";

export type DiagramBuild = {
  layout: LayoutPlan;
  routes: RoutePlan;
};

export const emptyOverrides: DiagramOverrides = {
  cableOverrides: {},
  protectedConnectionIds: {},
};

export function buildDiagram(model: SpliceModel, overrides: DiagramOverrides): DiagramBuild {
  const layout = createLayoutPlan(model, overrides);
  const routes = routeSpliceStrands(model, layout, overrides);
  return { layout, routes };
}
