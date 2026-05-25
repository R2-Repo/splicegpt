export type Side = "left" | "right";

export type Point = {
  x: number;
  y: number;
};

export type FiberColor =
  | "BL"
  | "OR"
  | "GR"
  | "BR"
  | "SL"
  | "WH"
  | "RD"
  | "BK"
  | "YL"
  | "VI"
  | "RO"
  | "AQ";

export type TubeColor = FiberColor | `${FiberColor}-BK` | string;

export type EndpointRole = "source" | "target";

export type FiberEndpoint = {
  role: EndpointRole;
  cableName: string;
  cableId: string;
  tubeColor: TubeColor;
  fiberNumber: number;
  fiberColor: FiberColor;
  device?: string;
};

export type SpliceConnection = {
  id: string;
  source: FiberEndpoint;
  target: FiberEndpoint;
  circuitName?: string;
  raw?: string;
};

export type CableLeg = {
  id: string;
  name: string;
  sideHint: Side;
  fibers: FiberEndpoint[];
};

export type SpliceModel = {
  id: string;
  title: string;
  connections: SpliceConnection[];
  cables: CableLeg[];
  warnings: string[];
};

export type CableOverride = {
  side?: Side;
  position?: Point;
  order?: number;
};

export type DiagramOverrides = {
  cableOverrides: Record<string, CableOverride>;
  protectedConnectionIds: Record<string, boolean>;
};

export type FiberAnchor = FiberEndpoint & {
  connectionId: string;
  circuitName?: string;
  localY: number;
  absolute: Point;
};

export type CableLayout = {
  id: string;
  name: string;
  side: Side;
  x: number;
  y: number;
  width: number;
  height: number;
  anchors: FiberAnchor[];
};

export type LayoutPlan = {
  width: number;
  height: number;
  centerX: number;
  cables: CableLayout[];
  anchorsByConnection: Record<
    string,
    {
      source: FiberAnchor;
      target: FiberAnchor;
    }
  >;
};

export type Segment = {
  kind: "h" | "v";
  from: Point;
  to: Point;
};

export type RoutedStrand = {
  id: string;
  connectionId: string;
  source: Point;
  target: Point;
  midX: number;
  points: Point[];
  segments: Segment[];
  lane: number;
  zoneKey: string;
  color: string;
  protected: boolean;
  circuitName?: string;
};

export type RoutingDiagnostic = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  connectionIds?: string[];
};

export type RoutePlan = {
  routes: RoutedStrand[];
  diagnostics: RoutingDiagnostic[];
};
