export default {
  name: "verify:fuel-create-resets-on-company-change",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-create-resets-on-company-change.mjs"]);
  },
};
