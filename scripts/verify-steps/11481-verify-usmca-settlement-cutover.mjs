export default {
  name: "verify:usmca-settlement-cutover",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-settlement-cutover.mjs", "--selftest"]);
    // 443.101: the live half runs in the live-DB job (ci.yml required-live-load-guard); its selftest stays here.
  },
};
