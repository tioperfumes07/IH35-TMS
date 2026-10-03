export default {
  name: "verify:samsara-fuel-reports-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-fuel-reports-engine.mjs"]);
  },
};
