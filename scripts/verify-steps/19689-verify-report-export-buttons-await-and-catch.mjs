export default {
  name: "verify:report-export-buttons-await-and-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-report-export-buttons-await-and-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-report-export-buttons-await-and-catch.mjs"]);
  },
};
