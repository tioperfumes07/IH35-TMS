export default {
  name: "verify:faro-reserve-by-customer-ties-to-gl",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-reserve-by-customer-ties-to-gl.mjs"]);
  },
};
