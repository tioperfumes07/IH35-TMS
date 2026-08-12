export default {
  name: "verify-book-load-stamps-linkage-fks",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-stamps-linkage-fks.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-book-load-stamps-linkage-fks.mjs"]);
  },
};
