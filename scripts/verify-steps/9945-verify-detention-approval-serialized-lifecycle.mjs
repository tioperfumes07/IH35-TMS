export default {
  name: "verify:detention-approval-serialized-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-detention-approval-serialized-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-detention-approval-serialized-lifecycle.mjs"]);
  },
};
