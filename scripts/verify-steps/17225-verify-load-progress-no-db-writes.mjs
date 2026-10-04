export default {
  name: "verify:load-progress-no-db-writes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-progress-no-db-writes.mjs"]);
  },
};
