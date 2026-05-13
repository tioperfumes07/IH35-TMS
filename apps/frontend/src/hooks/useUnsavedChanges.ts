function stableSnapshot(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Dirty detection for plain / serializable form snapshots (create modals, etc.).
 */
export function useUnsavedChanges<T>(current: T, baseline: T): { isDirty: boolean } {
  return {
    isDirty: stableSnapshot(current) !== stableSnapshot(baseline),
  };
}
