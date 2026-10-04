export default {
  name: "verify:export-upload-rate-limits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-export-upload-rate-limits.mjs"]);
  },
};
