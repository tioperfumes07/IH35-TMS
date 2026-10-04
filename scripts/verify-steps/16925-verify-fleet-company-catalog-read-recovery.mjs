export default {
  name: "verify:fleet-company-catalog-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-company-catalog-read-recovery.mjs"]);
  },
};
