export default {
  name: "verify:faro-reserve-registers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-reserve-registers.mjs"]);
  },
};
