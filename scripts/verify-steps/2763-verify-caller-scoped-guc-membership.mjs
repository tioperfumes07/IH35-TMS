export default {
  name: "verify-caller-scoped-guc-membership",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-caller-scoped-guc-membership.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
