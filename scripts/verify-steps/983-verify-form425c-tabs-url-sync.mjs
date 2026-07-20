export default {
  name: "verify:form425c-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form425c-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-tabs-url-sync.mjs"]);
  },
};
