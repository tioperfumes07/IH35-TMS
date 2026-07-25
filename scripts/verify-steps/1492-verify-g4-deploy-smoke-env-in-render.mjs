export default {
  name: "verify:g4-deploy-smoke-env-in-render",
  run(ctx) {
    ctx.run("node", ["scripts/verify-g4-deploy-smoke-env-in-render.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-g4-deploy-smoke-env-in-render.mjs"]);
  },
};
