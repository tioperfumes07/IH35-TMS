export default {
  name: "verify:migration-checksum-overrides-match-disk",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-checksum-overrides-match-disk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-migration-checksum-overrides-match-disk.mjs"]);
  },
};
