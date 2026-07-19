#!/usr/bin/env node
/**
 * verify-revenue-gl-linkage-db-isolation
 *
 * ROOT CAUSE (flake): revenue-gl-linkage.db.test.ts used getOperatingCompanyId() (shared TRANSP).
 * Parallel CI forks seeded Income credits under the same company/date window → flake
 * expected 28500 received 368500 on "reversed + posted compensating same-day nets zero".
 *
 * ROOT CAUSE (RLS 42501 on #2723): suite created a second isolated company but inserted
 * accounting.invoices for otherCompanyId while session GUC was still the primary company.
 * accounting.invoices WITH CHECK requires operating_company_id = app.operating_company_id
 * (no broad bypass escape). Fix: bypass(scopeCompanyId, fn) per company; other-company
 * rows under bypass(otherCompanyId, …); restore primary scope before service assertions.
 *
 * Rule 17: verify-step only (no package.json / workflow thrash). Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/backend/src/home/__tests__/revenue-gl-linkage.db.test.ts");
const LABEL = "verify:revenue-gl-linkage-db-isolation";

export function collectFailures(src) {
  const failures = [];
  if (!/createIsolatedOperatingCompany/.test(src)) {
    failures.push("revenue-gl-linkage.db.test.ts must call createIsolatedOperatingCompany()");
  }
  if (/\bgetOperatingCompanyId\s*\(/.test(src)) {
    failures.push("revenue-gl-linkage.db.test.ts must not use getOperatingCompanyId() (shared TRANSP race)");
  }
  if (!/deactivateIsolatedOperatingCompany/.test(src)) {
    failures.push("revenue-gl-linkage.db.test.ts must teardown via deactivateIsolatedOperatingCompany");
  }
  // Scoped session: bypass(scopeCompanyId, fn) — not bare bypass(fn) locked to one company.
  if (!/async function bypass\s*<[^>]*>\s*\(\s*scopeCompanyId\s*:/.test(src) && !/async function bypass\s*<[^>]*>\s*\(\s*\w+CompanyId\s*:/.test(src)) {
    if (!/async function bypass[\s\S]*?\(\s*scopeCompanyId/.test(src)) {
      failures.push(
        "bypass helper must take scopeCompanyId (canonical per-company GUC) — not a fixed primary-only session"
      );
    }
  }
  if (!/bypass\s*\(\s*otherCompanyId/.test(src)) {
    failures.push(
      "other-company FORCED-RLS rows must be inserted/cleaned under bypass(otherCompanyId, …) matching GUC"
    );
  }
  if (!/bypass\s*\(\s*companyId/.test(src)) {
    failures.push("primary-company seed/cleanup must use bypass(companyId, …)");
  }
  // Plant the exact #2723 defect: other-company invoice insert nested only under primary bypass.
  if (
    /bypass\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*otherCompanyId[\s\S]*INSERT INTO accounting\.invoices/.test(src) &&
    !/bypass\s*\(\s*otherCompanyId/.test(src)
  ) {
    failures.push(
      "must not insert otherCompanyId accounting.invoices inside primary-only bypass() — RLS WITH CHECK fails (42501)"
    );
  }
  if (!/two-company FORCED-RLS setup/.test(src)) {
    failures.push("must include behavioral test proving two-company setup under FORCED RLS");
  }
  if (!/cross-company invoice insert without matching GUC still fails/.test(src)) {
    failures.push("must include behavioral test that cross-company insert without scope fails (42501)");
  }
  if (!/gl_posted_revenue_cents\)\.toBe\(revenueCents \+ 3500\)/.test(src) && !/toBe\(revenueCents \+ 3500\)/.test(src)) {
    failures.push("financial expectation gl_posted_revenue_cents === revenueCents + 3500 must be preserved");
  }
  return failures;
}

function selftest() {
  const good = `
    import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "...";
    async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>): Promise<T> {
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [scopeCompanyId]);
      return fn();
    }
    const isolated = await createIsolatedOperatingCompany({ codePrefix: "RGL" });
    await bypass(companyId, async () => { /* primary */ });
    await bypass(otherCompanyId, async () => {
      await db.query("INSERT INTO accounting.invoices ...", [otherCompanyInvoiceId, otherCompanyId]);
    });
    await deactivateIsolatedOperatingCompany(db, isolated);
    it("two-company FORCED-RLS setup: other-company invoice visible under its scope, hidden under primary", async () => {});
    it("FORCED RLS: cross-company invoice insert without matching GUC still fails", async () => {});
    expect(result.gl_posted_revenue_cents).toBe(revenueCents + 3500);
  `;
  if (collectFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected`, collectFailures(good));
    process.exit(1);
  }
  const plants = [
    {
      name: "missing isolation helper",
      src: "companyId = 'x'; await deactivateIsolatedOperatingCompany(db, x); expect(x).toBe(revenueCents + 3500);",
      expect: (f) => f.some((x) => /createIsolatedOperatingCompany/i.test(x)),
    },
    {
      name: "shared TRANSP getOperatingCompanyId",
      src: `
        import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "x";
        async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>) { return fn(); }
        companyId = getOperatingCompanyId();
        await createIsolatedOperatingCompany({});
        await bypass(companyId, async () => {});
        await bypass(otherCompanyId, async () => {});
        await deactivateIsolatedOperatingCompany(db, isolated);
        it("two-company FORCED-RLS setup", () => {});
        it("cross-company invoice insert without matching GUC still fails", () => {});
        expect(r.gl_posted_revenue_cents).toBe(revenueCents + 3500);
      `,
      expect: (f) => f.some((x) => /getOperatingCompanyId|TRANSP/i.test(x)),
    },
    {
      name: "missing deactivate teardown",
      src: `
        import { createIsolatedOperatingCompany } from "x";
        async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>) { return fn(); }
        await createIsolatedOperatingCompany({});
        await bypass(companyId, async () => {});
        await bypass(otherCompanyId, async () => {});
        it("two-company FORCED-RLS setup", () => {});
        it("cross-company invoice insert without matching GUC still fails", () => {});
        expect(r.gl_posted_revenue_cents).toBe(revenueCents + 3500);
      `,
      expect: (f) => f.some((x) => /deactivateIsolatedOperatingCompany/i.test(x)),
    },
    {
      name: "other-company insert under primary-only bypass (cooldown/#2723)",
      src: `
        import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "x";
        async function bypass<T>(fn: () => Promise<T>) {
          await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
          return fn();
        }
        await createIsolatedOperatingCompany({});
        await deactivateIsolatedOperatingCompany(db, isolated);
        await bypass(async () => {
          await db.query("INSERT INTO accounting.invoices", [id, otherCompanyId]);
        });
        it("two-company FORCED-RLS setup", () => {});
        it("cross-company invoice insert without matching GUC still fails", () => {});
        expect(r.gl_posted_revenue_cents).toBe(revenueCents + 3500);
      `,
      expect: (f) =>
        f.some((x) => /scopeCompanyId|otherCompanyId|primary-only|WITH CHECK|42501/i.test(x)),
    },
    {
      name: "missing cross-company fail test",
      src: `
        import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "x";
        async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>) { return fn(); }
        await createIsolatedOperatingCompany({});
        await bypass(companyId, async () => {});
        await bypass(otherCompanyId, async () => {});
        await deactivateIsolatedOperatingCompany(db, isolated);
        it("two-company FORCED-RLS setup", () => {});
        expect(r.gl_posted_revenue_cents).toBe(revenueCents + 3500);
      `,
      expect: (f) => f.some((x) => /cross-company insert without scope|without matching GUC|42501/i.test(x)),
    },
    {
      name: "weakened financial expectation",
      src: `
        import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "x";
        async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>) { return fn(); }
        await createIsolatedOperatingCompany({});
        await bypass(companyId, async () => {});
        await bypass(otherCompanyId, async () => {});
        await deactivateIsolatedOperatingCompany(db, isolated);
        it("two-company FORCED-RLS setup", () => {});
        it("cross-company invoice insert without matching GUC still fails", () => {});
        expect(r.gl_posted_revenue_cents).toBeGreaterThanOrEqual(0);
      `,
      expect: (f) => f.some((x) => /financial expectation|28500|revenueCents \+ 3500/i.test(x)),
    },
  ];
  for (const p of plants) {
    const failures = collectFailures(p.src);
    if (!p.expect(failures)) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${p.name}" not detected`, failures);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS (${plants.length} plants)`);
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`${LABEL} FAIL: missing ${TARGET}`);
    process.exit(1);
  }
  const failures = collectFailures(fs.readFileSync(TARGET, "utf8"));
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — isolated companies + per-company FORCED-RLS session scope`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
