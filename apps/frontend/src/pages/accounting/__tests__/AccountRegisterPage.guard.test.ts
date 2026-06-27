import { describe, it, expect } from "vitest";
import page from "../AccountRegisterPage.tsx?raw";
import manifest from "../../../routes/manifest.tsx?raw";

// CA-05 static guard for the QBO-parity register page: columns present, drill-through wired to REAL routes,
// cents formatting, density, honest empty state, no stubs. Locks the COMPLETE-BUILD bar against regressions.
describe("AccountRegisterPage CA-05 guard", () => {
  it("renders the QBO-parity columns", () => {
    for (const col of [">Payee<", ">Account<", ">Class<", ">Increase<", ">Decrease<", ">Running balance<", ">C/R<"]) {
      expect(page, `missing column ${col}`).toContain(col);
    }
  });

  it("wires row drill-through to the source transaction", () => {
    expect(page).toMatch(/onClick=\{\(\)\s*=>\s*navigate\(sourceRoute\(/);
  });

  it("every drill-through target route exists in the manifest", () => {
    // base paths the resolver navigates to — each must be a real <Route> in the manifest.
    const targets = [
      "/accounting/invoices/",
      "/accounting/payments/",
      "/accounting/bills",
      "/accounting/bill-payments",
      "/accounting/expenses",
      "/driver-finance/settlements",
      "/accounting/journal-entries",
    ];
    const missing = targets.filter((t) => {
      const base = t.endsWith("/") ? t.slice(0, -1) : t; // strip the :id trailing slash
      return !(manifest.includes(`path="${base}"`) || manifest.includes(`path="${base}/:id"`));
    });
    expect(missing, `drill-through routes not in manifest: ${missing.join(", ")}`).toEqual([]);
  });

  it("formats money in cents (/100) — no 10x bug", () => {
    expect(page).toMatch(/\/\s*100/); // fmtCents divides cents by 100
    expect(page).toContain("fmtCents(");
  });

  it("has a density toggle + honest empty state, no stub strings", () => {
    expect(page).toContain("Density");
    expect(page).toContain("No transactions in this range.");
    expect(page).not.toMatch(/TODO|FIXME|coming soon|not implemented/i);
  });
});
