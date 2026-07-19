export default {
  name: "verify-posting-lineage-onerror",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-posting-lineage-onerror.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-posting-lineage-onerror.mjs", "--selftest"]);
  },
};
