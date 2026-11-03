export default {
  name: "verify:row-changes-evidence-coverage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-row-changes-evidence-coverage.mjs"]);
  },
};
