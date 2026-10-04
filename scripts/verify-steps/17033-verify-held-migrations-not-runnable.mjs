export default {
  name: "verify:held-migrations-not-runnable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-held-migrations-not-runnable.mjs"]);
  },
};
