/** ROUND 443.29-B — Relay wallet funding: bank/card outflow = wallet + 3.25% fee (integer half-up). */
export const RELAY_DEPOSIT_FEE_BPS = 325;

export function relayDepositFeeCents(walletCents: number): number {
  const w = Math.trunc(walletCents);
  if (w <= 0) return 0;
  return Math.trunc((w * RELAY_DEPOSIT_FEE_BPS + 5000) / 10000);
}

export function relayDepositChargedCents(walletCents: number): number {
  const w = Math.trunc(walletCents);
  return w + relayDepositFeeCents(w);
}

/** SQL expression on integrations.relay_deposits alias `rd` — charged amount for match scoring. */
export const RELAY_DEPOSIT_CHARGED_AMOUNT_SQL = `(rd.total_amount_cents + (rd.total_amount_cents * ${RELAY_DEPOSIT_FEE_BPS} + 5000) / 10000)`;
