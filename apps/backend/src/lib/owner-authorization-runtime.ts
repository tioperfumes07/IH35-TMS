/**
 * owner-authorization-runtime.ts — LEAD 443.260.5 (CC-2): an owner-only repair ROUTE runs a production data repair only
 * while its AUTH-<NNN> record on main is OPEN and unexpired — the same rule scripts/verify-owner-authorization.mjs
 * enforces for a script's --apply, read here from the deployed checkout's docs/bus/OWNER-AUTHORIZATIONS.md (the backend
 * runs from the repo root, so the file the merge put on main is the file this reads). A dry run needs no AUTH.
 * Fails closed: a missing file, a missing block, a non-OPEN status or an expired / unparseable expires_at refuses.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REL = "docs/bus/OWNER-AUTHORIZATIONS.md";

export class OwnerAuthorizationError extends Error {
  constructor(public readonly authId: string, public readonly reason: string) {
    super(`${authId}: ${reason}`);
  }
}

function findFile(): string | null {
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const p = path.join(dir, REL);
      if (fs.existsSync(p)) return p;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

/** Pure evaluation (exported for tests): null when OPEN and unexpired, else the refusal reason. */
export function ownerAuthorizationRefusal(fileText: string, authId: string, nowMs: number): string | null {
  if (!/^AUTH-\d+$/.test(authId)) return "not an AUTH-<digits> id";
  const block = new RegExp(`^## ${authId}\\n((?:(?!\\n## AUTH-)[\\s\\S])*)`, "m").exec(fileText)?.[1];
  if (!block) return `no ${authId} record in ${REL}`;
  const field = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, "m").exec(block)?.[1]?.trim() ?? null;
  const status = field("status");
  if (status !== "OPEN") return `status is ${JSON.stringify(status)}, not OPEN`;
  const expires = Date.parse(field("expires_at") ?? "");
  if (Number.isNaN(expires)) return "no valid expires_at";
  if (nowMs >= expires) return `expired at ${field("expires_at")}`;
  return null;
}

export function assertOwnerAuthorizationOpen(authId: string, nowMs = Date.now()): void {
  const file = findFile();
  if (!file) throw new OwnerAuthorizationError(authId, `${REL} is not in the deployed checkout`);
  const refusal = ownerAuthorizationRefusal(fs.readFileSync(file, "utf8"), authId, nowMs);
  if (refusal) throw new OwnerAuthorizationError(authId, refusal);
}
