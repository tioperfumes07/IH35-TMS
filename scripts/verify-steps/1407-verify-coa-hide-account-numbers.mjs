/** Cursor lane — hide QBO/CoA account numbers in lists/pickers (default OFF + CoA toggle). */
export default {
  name: "verify-coa-hide-account-numbers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-hide-account-numbers.mjs"]);
  },
};
