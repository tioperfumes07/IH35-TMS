export default {
  name: "verify:lists-reference-states-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-reference-states-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-reference-states-connectivity-exact.mjs"]);
  },
};
