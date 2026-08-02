// GUARD — Reports home box-in-box flatten (verify-step 2028).
export default {
  name: "reports-home-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-reports-home-no-box-in-box.mjs"]);
  },
};
