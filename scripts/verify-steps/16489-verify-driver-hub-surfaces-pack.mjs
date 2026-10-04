export default {
  name: "verify:driver-hub-surfaces-pack",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hub-surfaces-pack.mjs"]);
  },
};
