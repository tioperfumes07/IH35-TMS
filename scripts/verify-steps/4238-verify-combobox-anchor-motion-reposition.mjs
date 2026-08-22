export default {
  name: "verify:combobox-anchor-motion-reposition",
  run(ctx) {
    ctx.run("node", ["scripts/verify-combobox-anchor-motion-reposition.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-combobox-anchor-motion-reposition.mjs"]);
  },
};
