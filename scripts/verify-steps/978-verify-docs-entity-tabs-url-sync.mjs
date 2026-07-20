export default {
  name: "verify:docs-entity-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-entity-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-docs-entity-tabs-url-sync.mjs"]);
  },
};
