export default {
  name: "verify-driver-border-credentials-edit",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-border-credentials-edit.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
