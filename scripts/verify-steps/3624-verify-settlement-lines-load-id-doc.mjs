// verify-steps wrapper — LV-CLAUDEMD-S4-SETTLEMENT-LINES-HAS-LOAD-ID · claim 3624
export default {
  name: "verify-settlement-lines-load-id-doc",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-lines-load-id-doc.mjs"]);
  },
};
