export default {
  name: "verify:factor-admin-create-vocab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-admin-create-vocab.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factor-admin-create-vocab.mjs"]);
  },
};
