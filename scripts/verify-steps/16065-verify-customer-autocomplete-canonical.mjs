export default {
  name: "verify:customer-autocomplete-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-autocomplete-canonical.mjs"]);
  },
};
