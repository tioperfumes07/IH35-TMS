// Tire positions — the fixed position catalog and its lookups. Plain data, no HTTP: services and jobs import it from here,
// never from tires.routes.ts (a service importing a route module drags the auth middleware and session provider into
// every job that loads it — CC-2 2026-10-04).

export const TRACTOR_POSITIONS = [
  { code: "STEER-LF", group: "steer", label: "Steer Left Front" },
  { code: "STEER-RF", group: "steer", label: "Steer Right Front" },
  { code: "DRIVE-LF1", group: "drive", label: "Drive Left Front 1" },
  { code: "DRIVE-LF2", group: "drive", label: "Drive Left Front 2" },
  { code: "DRIVE-LR1", group: "drive", label: "Drive Left Rear 1" },
  { code: "DRIVE-LR2", group: "drive", label: "Drive Left Rear 2" },
  { code: "DRIVE-RF1", group: "drive", label: "Drive Right Front 1" },
  { code: "DRIVE-RF2", group: "drive", label: "Drive Right Front 2" },
  { code: "DRIVE-RR1", group: "drive", label: "Drive Right Rear 1" },
  { code: "DRIVE-RR2", group: "drive", label: "Drive Right Rear 2" },
] as const;

export const TRAILER_POSITIONS = [
  { code: "TRAILER-L1", group: "trailer", label: "Trailer Left 1" },
  { code: "TRAILER-L2", group: "trailer", label: "Trailer Left 2" },
  { code: "TRAILER-R1", group: "trailer", label: "Trailer Right 1" },
  { code: "TRAILER-R2", group: "trailer", label: "Trailer Right 2" },
  { code: "TRAILER-AXLE-L", group: "trailer", label: "Trailer Axle Left" },
  { code: "TRAILER-AXLE-R", group: "trailer", label: "Trailer Axle Right" },
] as const;

export const POSITION_BY_CODE = new Map<string, { code: string; group: "steer" | "drive" | "trailer"; label: string }>(
  [...TRACTOR_POSITIONS, ...TRAILER_POSITIONS].map((p) => [p.code, p] as const)
);

export function positionGroupForCode(code: string) {
  return POSITION_BY_CODE.get(code)?.group ?? null;
}
