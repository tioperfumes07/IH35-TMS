export default {
  name: "verify:items-list-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-items-list-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-items-list-url-sort.mjs"]);
  },
};
