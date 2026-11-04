export default {
  name: "verify:verify-escrow-posting-load-and-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-posting-load-and-date.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-posting-load-and-date.mjs"]);
  },
};
