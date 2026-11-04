export default {
  name: "verify:verify-eng04-advance-bank-evidence",
  run(ctx) {
    ctx.run("node", ["scripts/verify-eng04-advance-bank-evidence.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-eng04-advance-bank-evidence.mjs"]);
  },
};
