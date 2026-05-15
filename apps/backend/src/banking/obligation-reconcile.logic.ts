export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

export function suggestionConfidence(args: {
  amountCentsTxn: number;
  amountCentsObl: number;
  dateTxn: string;
  dateObl: string;
  descTxn: string;
  descObl: string;
}): { passes: boolean; score: number; lev: number } {
  const amtDiff = Math.abs(args.amountCentsTxn - args.amountCentsObl);
  if (amtDiff > 50) return { passes: false, score: 0, lev: 999 };
  const t0 = new Date(`${args.dateTxn}T12:00:00Z`).getTime();
  const t1 = new Date(`${args.dateObl}T12:00:00Z`).getTime();
  const days = Math.abs(t0 - t1) / 86_400_000;
  if (days > 7) return { passes: false, score: 0, lev: 999 };
  const lev = levenshtein(args.descTxn, args.descObl);
  if (lev >= 5) return { passes: false, score: 0, lev };
  const amountScore = 1 - amtDiff / 50;
  const dateScore = 1 - days / 7;
  const textScore = 1 - lev / 5;
  const score = 0.5 * amountScore + 0.35 * dateScore + 0.15 * textScore;
  return { passes: true, score, lev };
}
