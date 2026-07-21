export default {
  name: "verify:recourse-pipeline-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recourse-pipeline-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-recourse-pipeline-table-uses-paritytable.mjs"]);
  },
};
