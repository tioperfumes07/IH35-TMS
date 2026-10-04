export default {
  name: "verify:dispatch-precreate-driver-complete-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-precreate-driver-complete-roster.mjs"]);
  },
};
