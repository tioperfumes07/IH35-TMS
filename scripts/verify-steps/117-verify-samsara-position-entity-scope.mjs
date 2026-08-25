// 0091-c2-3 wired into verify:pre-commit. Fails if the Samsara position poll worker regresses to a
// bare owner_company_id operator attribution instead of COALESCE(currently_leased_to_company_id,
// owner_company_id) — a cross-entity leak that hides leased units from the operating carrier.
// Import-safe.
import { run } from "../verify-samsara-position-entity-scope.mjs";
export default {
  name: "samsara-position-entity-scope",
  run: async (ctx) => {
    const failures = run();
    if (failures.length) {
      throw new Error("samsara-position-entity-scope FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
    await ctx.run("node", ["scripts/verify-samsara-hos-pull-real-clocks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-samsara-hos-pull-real-clocks.mjs"]);
  },
};
