export default {
  name: "verify:warranty-create-identity-class",
  run(ctx) {
    ctx.run("node", ["scripts/verify-warranty-create-identity-class.mjs"]);
  },
};
