export default {
  name: "verify:g4-deploy-smoke-requires-fixed-unit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-g4-deploy-smoke-requires-fixed-unit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-g4-deploy-smoke-requires-fixed-unit.mjs"]);
  },
};
