export default {
  name: "verify:owner-lock-override-propagates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-owner-lock-override-propagates.mjs"]);
  },
};
