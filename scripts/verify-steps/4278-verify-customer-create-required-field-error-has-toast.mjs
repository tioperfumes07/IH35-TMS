export default {
  name: "verify:customer-create-required-field-error-has-toast",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-create-required-field-error-has-toast.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-create-required-field-error-has-toast.mjs"]);
  },
};
