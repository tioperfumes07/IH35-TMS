export default {
  name: "verify:migration-verification-readonly",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-verification-readonly.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-migration-verification-readonly.mjs"]);
  },
};
