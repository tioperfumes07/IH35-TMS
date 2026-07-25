// BANK-ECON-03 / BANK-SURF-03 — the bank-feed "mark as transfer" action must mint (or link to) a real
// banking.transfers row via the existing createTransfer() poster instead of only tagging columns.
export default {
  name: "verify:bank-feed-mark-transfer-writes-transfers",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-bank-feed-mark-transfer-writes-transfers.mjs"]);
  },
};
