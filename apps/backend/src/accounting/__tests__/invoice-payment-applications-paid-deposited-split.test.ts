import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A5 item 3 (ROUND 21.1) — Invoice detail's Payment Applications must carry both Paid
 * (payment_date/applied_at, unchanged) AND Deposited (cleared_date, THREE-DATES-COVERAGE-GAP
 * migration 202613310400) so the frontend can render the split rather than collapsing "recorded"
 * and "bank-cleared" into one date, per the owner's ROUND 21.1 ask.
 *
 * Repo-root anchored (see invoices-has-balance-filter.test.ts's own comment on why: this test
 * reads source by path, and cwd-anchoring silently doubles the path when run from apps/backend).
 */
const repoRootPath = (p: string) => path.resolve(fileURLToPath(new URL("../../../../../", import.meta.url)), p);

describe("invoice payment_applications — Paid vs Deposited split (A5 item 3)", () => {
  const routes = fs.readFileSync(repoRootPath("apps/backend/src/accounting/invoices.routes.ts"), "utf8");
  const queryStart = routes.indexOf("const applicationsRes = await client.query(");
  const queryEnd = routes.indexOf(");", routes.indexOf("LIMIT 50", queryStart));
  const query = routes.slice(queryStart, queryEnd);

  it("query exists and is the one feeding payment_applications", () => {
    expect(queryStart).toBeGreaterThan(-1);
    expect(routes).toContain("payment_applications: applicationsRes.rows");
  });

  it("selects cleared_date (Deposited) alongside payment_date (Paid) — never collapses the two", () => {
    expect(query).toContain("p.payment_date");
    expect(query).toContain("p.cleared_date");
    // The two dates must be distinct selected columns, not one field doing double duty.
    expect(query.indexOf("p.payment_date")).not.toBe(query.indexOf("p.cleared_date"));
  });

  it("joins the deposited-to account so the UI can show WHICH account, matching PaymentDetailPage's own pattern", () => {
    expect(query).toContain("p.deposited_to_account_id");
    expect(query).toContain("dep_acct.account_name AS deposited_to_account_name");
    expect(query).toContain("LEFT JOIN catalogs.accounts dep_acct");
    expect(query).toContain("dep_acct.id::text = p.deposited_to_account_id");
    // Entity-scoped join — never cross-company.
    expect(query).toContain("dep_acct.operating_company_id = p.operating_company_id");
  });

  it("stays entity-scoped and bounded (no baseline widen of the existing query's own guards)", () => {
    expect(query).toContain("p.operating_company_id = $2::uuid");
    expect(query).toContain("WHERE pa.invoice_id = $1");
    expect(query).toContain("LIMIT 50");
  });
});
