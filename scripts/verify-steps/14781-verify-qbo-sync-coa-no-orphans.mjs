export default {
  name: "verify:qbo-sync-coa-no-orphans",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-coa-no-orphans.mjs"]);
  },
};
