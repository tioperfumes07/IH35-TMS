export default {
  name: "verify:harsh-events-poll-fallback-exists",
  run(ctx) {
    ctx.run("node", ["scripts/verify-harsh-events-poll-fallback-exists.mjs"]);
  },
};
