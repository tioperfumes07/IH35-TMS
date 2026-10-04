export default {
  name: "verify:driver-applicant-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-applicant-action-company-lifecycle.mjs"]);
  },
};
