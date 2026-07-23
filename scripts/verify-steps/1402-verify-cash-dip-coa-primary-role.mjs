/** Cursor lane verify-step 1402 — cash_dip primary CoA role + DIP path. */
export default {
  name: "verify-cash-dip-coa-primary-role",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-cash-dip-coa-primary-role.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-dip-coa-primary-role.mjs"]);
  },
};
