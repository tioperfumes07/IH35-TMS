export default {
  name: "verify:lists-fleet-tire-positions-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-fleet-tire-positions-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-fleet-tire-positions-connectivity-exact.mjs"]);
  },
};
