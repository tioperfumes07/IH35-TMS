export default {
  name: "verify:photo-comparison-staging-incident-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-photo-comparison-staging-incident-identity.mjs"]);
  },
};
