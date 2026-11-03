export default {
  name: "verify:scheduler-tenant-context",
  run(ctx) {
    ctx.run("node", ["scripts/verify-scheduler-tenant-context.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-scheduler-tenant-context.mjs"]);
  },
};
