export type TtlCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs: number): void;
};

export function createTtlCache<T>(): TtlCache<T> {
  const store = new Map<string, { exp: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const row = store.get(key);
      if (!row) return undefined;
      if (Date.now() > row.exp) {
        store.delete(key);
        return undefined;
      }
      return row.value;
    },
    set(key: string, value: T, ttlMs: number) {
      store.set(key, { exp: Date.now() + ttlMs, value });
    },
  };
}
