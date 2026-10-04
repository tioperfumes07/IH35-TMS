export default {
  name: "verify:fleet-creator-company-label-association",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-creator-company-label-association.mjs"]);
  },
};
