export default {
  name: "verify:insurance-posting-dates-business-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-posting-dates-business-date.mjs"]);
  },
};
