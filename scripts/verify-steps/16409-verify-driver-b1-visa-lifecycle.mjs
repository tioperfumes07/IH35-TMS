export default {
  name: "verify:driver-b1-visa-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-b1-visa-lifecycle.mjs"]);
  },
};
