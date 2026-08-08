export default {
  name: "verify:combobox-id-label-binding",
  run(ctx) {
    ctx.run("node", ["scripts/verify-combobox-id-label-binding.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-combobox-id-label-binding.mjs"]);
  },
};
