export default {
  name: "verify:driver-picker-limit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-picker-limit.mjs"]);
  },
};
