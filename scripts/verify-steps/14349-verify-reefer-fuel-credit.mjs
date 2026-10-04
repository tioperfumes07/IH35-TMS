export default {
  name: "verify:reefer-fuel-credit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reefer-fuel-credit.mjs"]);
  },
};
