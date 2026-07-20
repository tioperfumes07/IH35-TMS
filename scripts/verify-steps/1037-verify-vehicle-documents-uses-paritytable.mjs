export default {
  name: "verify:vehicle-documents-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-documents-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vehicle-documents-uses-paritytable.mjs"]);
  },
};
