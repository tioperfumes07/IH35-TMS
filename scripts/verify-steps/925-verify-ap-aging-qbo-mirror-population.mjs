export default {
  name: "verify:ap-aging-qbo-mirror-population",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-aging-qbo-mirror-population.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ap-aging-qbo-mirror-population.mjs"]);
  },
};
