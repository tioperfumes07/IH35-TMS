const SCRIPT = "scripts/verify-wave-h3-bank-match-reverse-fk.mjs";
export default {
  name: "verify:wave-h3-bank-match-reverse-fk",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
