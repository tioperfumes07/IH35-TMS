export default {
  name: "verify:no-match-persisted-outside-accept-handler",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-match-persisted-outside-accept-handler.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-match-persisted-outside-accept-handler.mjs"]);
  },
};
