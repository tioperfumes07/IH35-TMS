export default {
  name: "verify:fuel-efficiency-signal-never-invents",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-efficiency-signal-never-invents.mjs"]);
  },
};
