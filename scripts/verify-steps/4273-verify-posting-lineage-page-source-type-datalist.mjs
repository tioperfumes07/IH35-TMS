export default {
  name: "verify:posting-lineage-page-source-type-datalist",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-lineage-page-source-type-datalist.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-posting-lineage-page-source-type-datalist.mjs"]);
  },
};
