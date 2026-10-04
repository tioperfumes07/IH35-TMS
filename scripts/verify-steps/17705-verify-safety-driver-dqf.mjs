export default {
  name: "verify:safety-driver-dqf",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-dqf.mjs"]);
  },
};
