// TASK-3 Team Chat — pure @mention helpers (extracted for regression testing).

// The active mention token = the run of non-whitespace chars after the last '@' up to the cursor.
// Returns null when there is no open mention (no '@', whitespace after it, or an over-long run).
export function activeMentionToken(value: string, cursor: number): string | null {
  const upToCursor = value.slice(0, Math.max(0, Math.min(cursor, value.length)));
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const token = upToCursor.slice(at + 1);
  if (/\s/.test(token) || token.length > 40) return null;
  return token;
}

// Keep only the mention ids whose "@Name" still literally appears in the final body — so a user who
// deleted a mention from the text doesn't silently notify that person.
export function keptMentionIds(
  body: string,
  candidateIds: Iterable<string>,
  nameById: (id: string) => string | undefined,
): string[] {
  const kept: string[] = [];
  for (const id of candidateIds) {
    const name = nameById(id);
    if (name && body.includes(`@${name}`)) kept.push(id);
  }
  return kept;
}
