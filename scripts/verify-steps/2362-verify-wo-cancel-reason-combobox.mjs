export default {
  name: "verify-wo-cancel-reason-combobox",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-wo-cancel-reason-combobox.mjs"]);
  },
};
