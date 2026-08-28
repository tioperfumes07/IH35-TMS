// The Plaid Connections panel listed any bank account, including non-Plaid internal wallets
// (Relay Fuel Wallet, plaid_item_id IS NULL), as a fake permanently-red "Never synced" connection
// with no reconnect action. Step 9943 · CC-3 lane.
export default {
  name: "banking-plaid-connections-excludes-non-plaid-accounts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-plaid-connections-excludes-non-plaid-accounts.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-banking-plaid-connections-excludes-non-plaid-accounts.mjs"]);
  },
};
