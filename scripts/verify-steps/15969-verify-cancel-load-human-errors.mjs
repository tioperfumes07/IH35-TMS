export default {
  name: "verify:cancel-load-human-errors",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancel-load-human-errors.mjs"]);
  },
};
