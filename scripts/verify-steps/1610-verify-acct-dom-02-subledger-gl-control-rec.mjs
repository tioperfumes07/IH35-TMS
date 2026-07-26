export default {
  name: "verify-acct-dom-02-subledger-gl-control-rec",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-dom-02-subledger-gl-control-rec.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-acct-dom-02-subledger-gl-control-rec.mjs"]);
  },
};
