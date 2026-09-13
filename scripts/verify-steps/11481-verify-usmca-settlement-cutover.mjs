export default {
  name: "verify:usmca-settlement-cutover",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-settlement-cutover.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-usmca-settlement-cutover.mjs"]);
  },
};
