export default {
  name: "verify:internal-fine-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fine-lifecycle.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-internal-fine-lifecycle.mjs"]);
  },
};
