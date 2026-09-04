import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// WIZ-43 GUARD (owner ruling 2026-09-04). Cash advance and fuel advance were REMOVED from the Book Load
// wizard. A broker advance can be diesel, driver pay, or a repair — three categories, three accounts — so
// it belongs in Load Costs (category / vendor / paid-with / amount / Expense-or-Bill), never in one box at
// booking. The old booking behaviour was also wrong in direction (it created a PENDING driver cash-advance
// request — the broker's money booked as a driver debt) and hollow (fuel wrote a single audit line, nothing
// else). This guard fails if either advance is reintroduced to the wizard form, the create route schema, or
// the booking service. The driver-side advance keeps its request -> owner-approval -> settlement-deduction
// rails (cash-advance-requests.service.ts) — this guard asserts those rails are NOT removed.
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const FRONTEND = join(SRC, "..", "..", "frontend", "src");

describe("WIZ-43 — cash & fuel advance are removed from the Book Load wizard (not reintroduced)", () => {
  it("the wizard form has no cash_advance_cents / fuel_advance_cents field and no advance MoneyInput", () => {
    const form = readFileSync(join(FRONTEND, "pages/dispatch/components/BookLoadModalV4.tsx"), "utf8");
    expect(form).not.toMatch(/cash_advance_cents/);
    expect(form).not.toMatch(/fuel_advance_cents/);
    expect(form).not.toMatch(/ariaLabel="Cash advance"/);
    expect(form).not.toMatch(/ariaLabel="Fuel advance"/);
  });

  it("the dispatch create-load route schema no longer accepts cash/fuel advance fields", () => {
    const routeSrc = readFileSync(join(SRC, "dispatch/loads.routes.ts"), "utf8");
    expect(routeSrc).not.toMatch(/cash_advance_cents\s*:/);
    expect(routeSrc).not.toMatch(/fuel_advance_cents\s*:/);
    expect(routeSrc).not.toMatch(/cash_advance_recovery_mode\s*:/);
    expect(routeSrc).not.toMatch(/cash_advance_recovery_cents\s*:/);
  });

  it("the booking service neither reads advance fields nor creates a cash-advance request at booking", () => {
    const svcSrc = readFileSync(join(SRC, "dispatch/book-load.service.ts"), "utf8");
    expect(svcSrc).not.toMatch(/cash_advance_cents/);
    expect(svcSrc).not.toMatch(/fuel_advance_cents/);
    // the wizard entry point into the cash-advance rails is gone
    expect(svcSrc).not.toMatch(/createCashAdvanceRequest/);
  });

  it("the driver-side cash-advance rails remain intact (only the wizard entry point was removed)", () => {
    const rails = readFileSync(join(SRC, "driver-finance/cash-advance-requests.service.ts"), "utf8");
    // request -> owner-approval -> settlement-deduction rails still create PENDING requests keyed by load_id
    const insertBlock = rails.slice(rails.indexOf("INSERT INTO driver_finance.cash_advance_requests"));
    expect(insertBlock, "cash-advance-requests rails must still INSERT into cash_advance_requests").toBeTruthy();
    expect(insertBlock).toMatch(/'pending'/);
  });
});
