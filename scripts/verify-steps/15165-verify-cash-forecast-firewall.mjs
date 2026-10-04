export default {
  name: "verify:cash-forecast-firewall",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-forecast-firewall.mjs"]);
  },
};
