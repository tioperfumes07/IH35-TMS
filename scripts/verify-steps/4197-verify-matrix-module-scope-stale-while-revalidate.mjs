export default {
  name: "verify:matrix-module-scope-stale-while-revalidate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-matrix-module-scope-stale-while-revalidate.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-matrix-module-scope-stale-while-revalidate.mjs"]);
  },
};
