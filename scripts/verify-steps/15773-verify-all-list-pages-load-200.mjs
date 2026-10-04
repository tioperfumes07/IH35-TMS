export default {
  name: "verify:all-list-pages-load-200",
  run(ctx) {
    ctx.run("node", ["scripts/verify-all-list-pages-load-200.mjs"]);
  },
};
