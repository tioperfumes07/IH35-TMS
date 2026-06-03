import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const countModule = fs.readFileSync(path.join(here, "../../src/banking/driver-escrow-counts.ts"), "utf8");
const bankingRoutes = fs.readFileSync(path.join(here, "../../src/banking/banking.routes.ts"), "utf8");
const bankingHome = fs.readFileSync(path.join(here, "../../../frontend/src/pages/banking/BankingHome.tsx"), "utf8");
const kpiRow = fs.readFileSync(path.join(here, "../../../frontend/src/pages/banking/components/BankingKpiRow.tsx"), "utf8");

describe("banking driver-escrow-counts", () => {
  it("distinguishes active drivers from drivers with escrow balance", () => {
    assert.match(countModule, /active_drivers/);
    assert.match(countModule, /drivers_with_escrow_balance/);
    assert.match(countModule, /escrow_balance, 0\) > 0/);
  });

  it("labels match canonical SoT doc and Banking UI copy", () => {
    assert.match(countModule, /Drivers with Escrow Balance/);
    assert.match(kpiRow, /Escrow Balance \(DIP\)/);
    assert.match(bankingHome, /Drivers with escrow balance/);
    assert.match(bankingHome, /drivers_with_escrow_balance/);
    assert.match(bankingHome, /kpiQuery\.data\?\.active_drivers/);
  });

  it("banking dashboard kpis spreads escrow count fields", () => {
    assert.match(bankingRoutes, /countDriverEscrowKpis/);
    assert.match(bankingRoutes, /drivers_with_escrow_balance/);
  });
});
