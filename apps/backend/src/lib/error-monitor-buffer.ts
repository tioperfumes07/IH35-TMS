export type BufferedErrorKind = "client" | "server";

export type BufferedErrorRecord = {
  ts: number;
  kind: BufferedErrorKind;
  message: string;
  detail?: Record<string, unknown>;
};

const recent: BufferedErrorRecord[] = [];
const MAX = 200;

function trim() {
  while (recent.length > MAX) recent.shift();
}

export function pushBufferedClientError(detail: Record<string, unknown>) {
  recent.push({
    ts: Date.now(),
    kind: "client",
    message: String(detail.message ?? "client_error"),
    detail,
  });
  trim();
}

export function pushBufferedServerError(detail: Record<string, unknown>) {
  recent.push({
    ts: Date.now(),
    kind: "server",
    message: String(detail.message ?? "server_error"),
    detail,
  });
  trim();
}

export function snapshotBufferedErrors(limit = 100): BufferedErrorRecord[] {
  return [...recent].sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function countBufferedErrorsSince(ms: number, kind: BufferedErrorKind | "any" = "any") {
  const since = Date.now() - ms;
  return recent.filter((r) => r.ts >= since && (kind === "any" || r.kind === kind)).length;
}
