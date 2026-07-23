export default {
  name: "verify:fines-driver-name-not-uuid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fines-driver-name-not-uuid.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fines-driver-name-not-uuid.mjs"]);
  },
};
