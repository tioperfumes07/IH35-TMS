export default {
  name: "verify:samsara-hos-readiness-no-secret",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-hos-readiness-no-secret.mjs"]);
  },
};
