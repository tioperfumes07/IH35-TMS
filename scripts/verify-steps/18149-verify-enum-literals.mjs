export default {
  name: "verify:enum-literals",
  run(ctx) {
    ctx.run("node", ["scripts/verify-enum-literals.mjs"]);
  },
};
