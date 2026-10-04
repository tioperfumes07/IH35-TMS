export default {
  name: "verify:dot-dwell-detector-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dot-dwell-detector-tenant-scope.mjs"]);
  },
};
