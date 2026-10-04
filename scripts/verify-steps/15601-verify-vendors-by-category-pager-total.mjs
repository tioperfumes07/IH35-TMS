export default {
  name: "verify:vendors-by-category-pager-total",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-by-category-pager-total.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendors-by-category-pager-total.mjs"]);
  },
};
