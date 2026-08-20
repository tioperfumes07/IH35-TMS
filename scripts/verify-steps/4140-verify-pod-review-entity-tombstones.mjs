export default {
  name: "verify:pod-review-entity-tombstones",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pod-review-entity-tombstones.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-pod-review-entity-tombstones.mjs"]);
  },
};
