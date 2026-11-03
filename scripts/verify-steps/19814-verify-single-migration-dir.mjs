export default {
  name: "verify:single-migration-dir",
  run(ctx) {
    ctx.run("node", ["scripts/verify-single-migration-dir.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-single-migration-dir.mjs"]);
  },
};
