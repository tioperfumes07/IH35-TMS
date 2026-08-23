export default {
  name: "verify:training-completions-excludes-voided",
  run(ctx) {
    ctx.run("node", ["scripts/verify-training-completions-excludes-voided.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-training-completions-excludes-voided.mjs"]);
  },
};
