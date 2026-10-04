export default {
  name: "verify:paritytable-group-bands",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-group-bands.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-group-bands.mjs"]);
    // BANK-F91444 — C-37 house table format (never ran in CI).
    ctx.run("node", ["scripts/ops/verify-c37-house-table-format.mjs", "--selftest"]);
  },
};
