export default {
  name: "verify-h02-qbo-topbar-sync-now",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-h02-qbo-topbar-sync-now.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
