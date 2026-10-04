export default {
  name: "verify:medical-card-create-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-medical-card-create-company-lifecycle.mjs"]);
  },
};
