export default {
  name: "verify:migration-runner-hardening",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-runner-hardening.mjs"]);
  },
};
