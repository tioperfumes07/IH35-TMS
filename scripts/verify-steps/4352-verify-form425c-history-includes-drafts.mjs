export default {
  name: "verify:form425c-history-includes-drafts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form425c-history-includes-drafts.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-history-includes-drafts.mjs"]);
  },
};
