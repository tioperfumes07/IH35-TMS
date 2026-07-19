export default {
  name: "verify:factoring-list-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-list-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-list-url-sort.mjs"]);
  },
};
