export default {
  name: "verify:posting-lineage-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-lineage-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-posting-lineage-url-sort.mjs"]);
  },
};
