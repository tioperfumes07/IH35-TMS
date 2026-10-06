export default {
  name: "verify:bank-line-deletion-has-one-canonical-authority",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-line-deletion-has-one-canonical-authority.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-line-deletion-has-one-canonical-authority.mjs"]);
  },
};
