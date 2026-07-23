export default {
  name: "verify-faro-import-linkage",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-faro-import-linkage.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-faro-import-linkage.mjs", "--selftest"]);
  },
};
