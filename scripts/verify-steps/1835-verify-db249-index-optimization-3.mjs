export default {
  name: "verify:db249-index-optimization-3",
  run(ctx) {
    ctx.run("node", ["scripts/verify-db249-index-optimization-3.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-db249-index-optimization-3.mjs"]);
  },
};
