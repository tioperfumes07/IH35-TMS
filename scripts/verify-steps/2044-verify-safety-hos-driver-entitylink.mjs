export default {
  name: "safety-hos-driver-entitylink",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-hos-driver-entitylink.mjs"]);
  },
};
