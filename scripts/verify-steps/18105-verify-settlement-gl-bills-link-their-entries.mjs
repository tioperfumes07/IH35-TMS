export default {
  name: "verify:settlement-gl-bills-link-their-entries",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-gl-bills-link-their-entries.mjs"]);
  },
};
