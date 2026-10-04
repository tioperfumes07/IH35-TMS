export default {
  name: "verify:driver-nonmoney-business-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-nonmoney-business-date.mjs"]);
  },
};
