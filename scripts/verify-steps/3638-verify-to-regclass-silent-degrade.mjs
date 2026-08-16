// verify-steps wrapper — CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE · claim 3638
export default {
  name: "verify-to-regclass-silent-degrade",
  run(ctx) {
    ctx.run("node", ["scripts/verify-to-regclass-silent-degrade.mjs"]);
    ctx.run("node", ["scripts/verify-regclass-fallback-intent.mjs"]);
  },
};
