import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// CA-05 static guard: the register service must stay entity-scoped + read-only and keep the QBO-parity
// derivations wired (so a refactor can't silently drop RLS scoping or a column source).
const here = dirname(fileURLToPath(import.meta.url));
const svc = readFileSync(resolve(here, "account-register.service.ts"), "utf8");

describe("account-register service guard", () => {
  it("is operating_company_id-scoped (no cross-entity leak)", () => {
    expect(svc).toMatch(/p\.operating_company_id\s*=\s*\$1::uuid/);
    expect(svc).toMatch(/p\.account_id\s*=\s*\$2::uuid/);
  });

  it("reuses the canonical balance fn — no new GL math", () => {
    expect(svc).toContain("accounting.fn_account_balances_as_of");
  });

  it("excludes voided journal entries", () => {
    expect(svc).toMatch(/je\.status\s*<>\s*'voided'/);
  });

  it("derives the QBO-parity columns (split account, class, payee)", () => {
    expect(svc).toContain("AS split_account"); // contra-account lateral
    expect(svc).toMatch(/'-Split-'/); // multi-line marker
    expect(svc).toContain("catalogs.classes"); // class join
    // payee covers all unambiguous parties: bill→vendor, invoice→customer, payment→customer, settlement→driver
    expect(svc).toMatch(/COALESCE\(bv\.vendor_name,\s*ic\.customer_name/); // payee derivation
    expect(svc).toContain("driver_finance.driver_settlements"); // settlement→driver
    expect(svc).toMatch(/source_transaction_type = 'customer_payment'/); // payment→customer
  });

  it("has no stub / placeholder strings", () => {
    expect(svc).not.toMatch(/TODO|FIXME|coming soon|not implemented/i);
  });
});
