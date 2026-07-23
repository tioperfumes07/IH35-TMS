export default {
  name: "verify:escrow-posting-entitylink-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-posting-entitylink-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-posting-entitylink-reverse.mjs"]);
  },
};
