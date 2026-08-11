export default {
  name: "verify:customer-email-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-email-required.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-email-required.mjs"]);
  },
};
