export default {
  name: "verify:source-lineage-list-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-source-lineage-list-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-source-lineage-list-url-sort.mjs"]);
  },
};
