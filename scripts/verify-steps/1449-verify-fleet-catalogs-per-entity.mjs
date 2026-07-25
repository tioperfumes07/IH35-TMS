/**
 * LST-F02 — re-wire existing substance guard via verify-steps only (Rule 17).
 * Number 1449 avoids BANK/ACCT 1436–1442 and Lists 1443–1448.
 */
export default {
  name: "verify:fleet-catalogs-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-catalogs-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fleet-catalogs-per-entity.mjs"]);
  },
};
