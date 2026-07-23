export default {
  name: "verify:accidents-list-names-not-uuid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accidents-list-names-not-uuid.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-accidents-list-names-not-uuid.mjs"]);
  },
};
