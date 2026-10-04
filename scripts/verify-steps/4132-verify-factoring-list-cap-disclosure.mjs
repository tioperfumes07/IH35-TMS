export default {
  name: "verify:factoring-list-cap-disclosure",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-list-cap-disclosure.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-list-cap-disclosure.mjs"]);
    // BANK-F91510 — LocationMap leftover #64748b/#94a3b8 refuse (4395 is ODD; leftover now on this EVEN host).
    ctx.run("node", ["scripts/verify-lists-maintenance-generic-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-maintenance-generic-catalog-connectivity-exact.mjs"]);
  },
};
