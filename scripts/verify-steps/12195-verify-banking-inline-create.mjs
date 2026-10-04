export default {
  name: "verify:banking-inline-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-inline-create.mjs"]);
  },
};
