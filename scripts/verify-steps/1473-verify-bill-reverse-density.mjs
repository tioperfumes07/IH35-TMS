export default {
  name: "verify:bill-reverse-density-acct-f04",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-reverse-density.mjs"]);
    ctx.run("node", ["scripts/verify-bill-reverse-density.mjs", "--selftest"]);
  },
};
