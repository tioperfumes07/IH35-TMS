export default {
  name: "verify:fuel-relay-source-worm",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-relay-source-worm.mjs"]);
  },
};
