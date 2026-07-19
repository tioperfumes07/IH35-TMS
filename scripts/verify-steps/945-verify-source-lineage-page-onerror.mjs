export default {
  name: "verify-source-lineage-page-onerror",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-source-lineage-page-onerror.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-source-lineage-page-onerror.mjs", "--selftest"]);
  },
};
