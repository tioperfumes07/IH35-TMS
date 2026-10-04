export default {
  name: "verify:no-session-advisory-locks",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-session-advisory-locks.mjs"]);
  },
};
