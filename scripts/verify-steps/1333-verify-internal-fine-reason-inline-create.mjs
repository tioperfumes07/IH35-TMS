export default {
  name: "verify:internal-fine-reason-inline-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fine-reason-inline-create.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-internal-fine-reason-inline-create.mjs"]);
  },
};
