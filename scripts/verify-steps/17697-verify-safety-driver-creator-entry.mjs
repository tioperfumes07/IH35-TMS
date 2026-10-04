export default {
  name: "verify:safety-driver-creator-entry",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-creator-entry.mjs"]);
  },
};
