export default {
  name: "verify:cancel-paths-write-canonical-record",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancel-paths-write-canonical-record.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cancel-paths-write-canonical-record.mjs"]);
  },
};
