export default {
  name: "verify:fine-amend-guards",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fine-amend-guards.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fine-amend-guards.mjs"]);
  },
};
