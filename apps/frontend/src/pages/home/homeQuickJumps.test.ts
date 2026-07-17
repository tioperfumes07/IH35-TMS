import { describe, expect, it } from "vitest";
import { HOME_QUICK_JUMPS } from "./homeQuickJumps";
import { ACCOUNTING_HOME_QUICK_JUMP_COUNT, SUBNAV_ITEMS } from "../accounting/subnav-manifest";
import { BANKING_HOME_QUICK_JUMP_COUNT } from "../banking/BANKING_NAV_CONFIG";
import { FUEL_HOME_QUICK_JUMP_COUNT } from "../fuel/FUEL_TABS_CONFIG";
import { DISPATCH_HOME_QUICK_JUMP_COUNT } from "../../components/dispatch/DispatchSubnav";

// Note: "no stale hardcoded quick-jump literal (count: 38/22/19/27)" is enforced by the
// CI guard scripts/verify-home-quickjump-counts.mjs (wired via `verify:home-quickjump-counts`
// in .github/workflows/ci.yml), which reads the source files with plain Node fs outside the
// frontend tsc project. Duplicating that fs-based check here breaks `tsc -b` because
// apps/frontend/src is type-checked under tsconfig.app.json, which has no "node" types
// (only "vite/client") — node:fs/node:path/__dirname are all unresolvable there.
describe("HOME_QUICK_JUMPS", () => {
  it("uses canonical nav counts for Accounting/Banking/Fuel/Dispatch", () => {
    const byTitle = Object.fromEntries(HOME_QUICK_JUMPS.map((jump) => [jump.title, jump.count]));
    expect(byTitle.Accounting).toBe(ACCOUNTING_HOME_QUICK_JUMP_COUNT);
    expect(byTitle.Accounting).toBe(SUBNAV_ITEMS.length);
    expect(byTitle.Banking).toBe(BANKING_HOME_QUICK_JUMP_COUNT);
    expect(byTitle.Fuel).toBe(FUEL_HOME_QUICK_JUMP_COUNT);
    expect(byTitle.Dispatch).toBe(DISPATCH_HOME_QUICK_JUMP_COUNT);
  });
});
