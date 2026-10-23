import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// LEAD 443.268-B — the classes behind CC-2's live 500s (driver-merge set_config, the revenue-join contract) + the
// 443.270-C canonical engine scope, pinned. The Lead's 443.271 (#27329) owns cash-forecast / registry / overrides / sync-health / zod.
const ROOT = resolve(__dirname, "../../../../..");
const grep = (re: string) => {
  try { return execFileSync("git", ["grep", "-nE", re, "--", "apps/backend/src"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch { return []; }
};
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("443.268-B live 500 roots", () => {
  it("set_config is never handed a non-text bind (function set_config(unknown, uuid, boolean) does not exist)", () => {
    const hits = grep("set_config\\('[a-z_.]+', *\\$[0-9]+::(uuid|int|integer|bigint|boolean)").filter((l) => !/__tests__|\.test\./.test(l));
    expect(hits).toEqual([]);
  });

  it("every caller of proformaRemainingCentsSql mounts loadCostsRevenueJoin (it reads revenue.revenue_cents)", () => {
    const callers = [...new Set(grep("proformaRemainingCentsSql\\(").map((l) => l.split(":")[0]))]
      .filter((f) => !/__tests__|\.test\./.test(f) && !/cash-flow\.service\.ts$/.test(f));
    expect(callers.length).toBeGreaterThan(0);
    for (const f of callers) expect(src(f), f).toMatch(/\$\{loadCostsRevenueJoin\(/);
  });

  it("443.270-C (b): the canonical engine runs where it can SEE an archived shell, and a shell never survives", () => {
    const routes = src("apps/backend/src/mdata/canonical/canonical-entities.routes.ts");
    for (const fn of ["planCanonical", "mergeIntoCanonical", "reverseCanonicalMerge"]) {
      expect(routes, fn).not.toMatch(new RegExp(`withCompanyScope\\([^)]*\\)?[^;]{0,200}${fn}\\(`));
    }
    expect(routes).toMatch(/withCanonicalEngineScope\(req\.user!\.uuid, b\.data\.operating_company_id, \(client\) =>\s*mergeIntoCanonical\(/);
    expect(src("apps/backend/src/mdata/canonical/canonical-entities.service.ts")).toMatch(/const ranked = \[\.\.\.list\]\.sort\(\(a, b\) => Number\(b\.active\) - Number\(a\.active\) \|\| b\.refs - a\.refs/);
  });
});
