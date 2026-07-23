/** Cursor lane verify-step 1403 — settlement_lines line_type CHECK true supersets. */
export default {
  name: "verify-settlement-lines-line-type-superset",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-lines-line-type-superset.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-lines-line-type-superset.mjs"]);
  },
};
