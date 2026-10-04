export default {
  name: "verify:register-columns-are-filterable-multi-select",
  run(ctx) {
    ctx.run("node", ["scripts/verify-register-columns-are-filterable-multi-select.mjs"]);
  },
};
