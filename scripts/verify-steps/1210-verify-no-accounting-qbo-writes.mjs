export default {
  name: "verify-no-accounting-qbo-writes",
  run(ctx) {
    // Rule 17: auto-discover the existing 0008-g3 (QBO collapse Step-2) guard that was
    // package.json-only / .guard-exempt orphaned. Locks the completed accounting.qbo_* →
    // mdata.qbo_* writer repoint so a RETIRE-table write can never regress into live backend src.
    // ctx.run() fails closed (throws on nonzero, Rule 18); the explicit check is belt-and-suspenders.
    if (ctx.run("node", ["scripts/verify-no-accounting-qbo-writes.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-no-accounting-qbo-writes.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
