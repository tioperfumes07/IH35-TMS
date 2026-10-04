export default {
  name: "verify:escrow-emits-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-emits-audit.mjs"]);
  },
};
