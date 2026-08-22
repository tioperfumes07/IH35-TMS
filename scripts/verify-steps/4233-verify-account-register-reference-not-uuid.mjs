export default {
  name: "verify:account-register-reference-not-uuid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-register-reference-not-uuid.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-register-reference-not-uuid.mjs"]);
  },
};
