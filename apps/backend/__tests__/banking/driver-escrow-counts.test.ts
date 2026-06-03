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
    assert.match(countModule, /count\(DISTINCT id\)/i);
    assert.match(countModule, /COALESCE\(escrow_balance, 0\) <> 0/);
  });

  it("counts only drivers with non-zero escrow balance", () => {
    assert.doesNotMatch(countModule, /is_active\s*=\s*true/i);
    assert.match(countModule, /deactivated_at IS NULL/);
  });

  it("labels match canonical SoT doc and Banking UI copy", () => {
    assert.match(countModule, /Drivers with escrow/);
    assert.match(kpiRow, /Escrow Balance \(DIP\)/);
    assert.match(bankingHome, /Drivers with escrow:/);
    assert.match(bankingHome, /drivers_with_escrow_balance/);
    assert.doesNotMatch(bankingHome, /driver escrow visualizer[\s\S]{0,2500}Active drivers/i);
  });

  it("banking dashboard kpis spreads escrow count fields", () => {
    assert.match(bankingRoutes, /countDriverEscrowKpis/);
    assert.match(bankingRoutes, /drivers_with_escrow_balance/);
  });
});
