export default {
  name: "verify:driver-report-draft-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-report-draft-lifecycle.mjs"]);
  },
};
