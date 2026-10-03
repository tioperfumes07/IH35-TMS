export default {
  name: "verify:samsara-fence-push-flag-off-no-duplicates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-fence-push-flag-off-no-duplicates.mjs"]);
  },
};
