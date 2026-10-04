export default {
  name: "verify:nonmoney-backend-business-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-nonmoney-backend-business-date.mjs"]);
  },
};
