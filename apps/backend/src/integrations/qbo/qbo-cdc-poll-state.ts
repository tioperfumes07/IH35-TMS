/** In-memory CDC poll timestamps per QuickBooks realm (cross-request observability for sync health). */

const lastPollIsoByRealm: Record<string, string> = {};

export function markRealmCdcPolled(realmId: string) {
  lastPollIsoByRealm[realmId] = new Date().toISOString();
}

export function getLastCdcPollAtPerRealm(): Record<string, string> {
  return { ...lastPollIsoByRealm };
}
