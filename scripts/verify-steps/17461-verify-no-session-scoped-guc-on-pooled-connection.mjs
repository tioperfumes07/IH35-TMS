export default {
  name: "verify:no-session-scoped-guc-on-pooled-connection",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-session-scoped-guc-on-pooled-connection.mjs"]);
  },
};
