export default {
  name: "verify:escrow-forfeit-scope-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-forfeit-scope-snapshot.mjs"]);
  },
};
