export default {
  name: "2970-verify-systemic-42p18-set-config-text",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-systemic-42p18-set-config-text.mjs"]);
  },
};
