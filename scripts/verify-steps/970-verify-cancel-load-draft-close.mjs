export default {
  name: "verify-cancel-load-draft-close",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-cancel-load-draft-close.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
