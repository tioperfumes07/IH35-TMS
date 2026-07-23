export default {
  name: "verify:escrow-forfeit-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-forfeit-posting.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-escrow-forfeit-posting.mjs"]);
  },
};
