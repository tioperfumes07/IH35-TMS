// Rule 17 — ACCT-LINK-03 bill unit_id memo density (Cursor even ≥1700).
export default {
  name: "acct-link-03-bill-unit-density",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-acct-link-03-bill-unit-density.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-acct-link-03-bill-unit-density.mjs"]) !== 0) return 1;
    return 0;
  },
};
