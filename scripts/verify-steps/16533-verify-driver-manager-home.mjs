export default {
  name: "verify:driver-manager-home",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-manager-home.mjs"]);
  },
};
