export default {
  name: "verify:faro-csv-upload-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-csv-upload-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-faro-csv-upload-uses-paritytable.mjs"]);
  },
};
