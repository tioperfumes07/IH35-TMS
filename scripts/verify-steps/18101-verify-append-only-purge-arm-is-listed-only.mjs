export default {
  name: "verify:append-only-purge-arm-is-listed-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-append-only-purge-arm-is-listed-only.mjs"]);
  },
};
