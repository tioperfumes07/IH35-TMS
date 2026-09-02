export default {
  name: "verify-ui-design-system-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ui-design-system-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ui-design-system-ratchet.mjs"]);
  },
};
