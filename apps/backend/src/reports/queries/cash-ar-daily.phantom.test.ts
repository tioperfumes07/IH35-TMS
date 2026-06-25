import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * BLOCK-4 guard — phantom relations/columns this PR fixed must not creep back. Each was throwing
 * 42P01/42703 in prod:
 *   - reports/queries/cash-ar-daily.ts → `amount_received_cents` (no such column; real = amount_cents)
 *   - profitability + factoring → `sales.customers` / `dispatch.loads` (phantom; real = mdata.*)
 * Scoped to the files this PR owns so it stays green and bites on regression here.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FILES_AND_BANS: Array<{ rel: string; bans: RegExp[] }> = [
  { rel: "src/reports/queries/cash-ar-daily.ts", bans: [/\bamount_received_cents\b/, /\breceived_at\b/] },
  { rel: "src/profitability/profitability.routes.ts", bans: [/\bsales\.customers\b/] },
  { rel: "src/factoring/packet-assemble.service.ts", bans: [/\b(from|join|into|update)\s+dispatch\.loads\b/i] },
  {
    rel: "src/dispatch/factoring-queue.routes.ts",
    bans: [/\b(from|join|into|update)\s+dispatch\.loads\b/i, /\b(from|join|into|update)\s+docs\.file_categories\b/i],
  },
];

describe("financial phantom-relation guard (BLOCK-4)", () => {
  for (const { rel, bans } of FILES_AND_BANS) {
    it(`${rel} references no phantom relation/column`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const hits = bans.filter((b) => b.test(src)).map((b) => b.source);
      expect(hits, `${rel} still references: ${hits.join(", ")}`).toEqual([]);
    });
  }
});
