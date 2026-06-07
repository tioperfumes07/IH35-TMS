import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SearchResultItem, type SearchResult } from "./SearchResultItem";

const RECENT_KEY = "ih35.cmdk.recent";
const MAX_RECENT = 10;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  const trimmed = term.trim();
  if (!trimmed) return;
  const next = [trimmed, ...loadRecent().filter((v) => v !== trimmed)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function CmdKQuickSwitcher() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  const recent = useMemo(() => loadRecent(), [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, []);

  const selectResult = useCallback(
    (result: SearchResult) => {
      saveRecent(query);
      close();
      navigate(result.url_path);
    },
    [close, navigate, query]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isK = event.key.toLowerCase() === "k";
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && isK) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedCompanyId) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setActiveIndex(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          operating_company_id: selectedCompanyId,
          q: trimmed,
          limit: "20",
        });
        const res = await apiRequest<{ results: SearchResult[] }>(`/api/search/universal?${qs.toString()}`);
        setResults(res.results);
        setActiveIndex(0);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, selectedCompanyId, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      data-testid="cmd-k-quick-switcher"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-4 py-3">
          <input
            ref={inputRef}
            data-testid="cmd-k-input"
            className="w-full border-0 text-base outline-none"
            placeholder="Search loads, drivers, customers…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((idx) => Math.min(idx + 1, Math.max(results.length - 1, 0)));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((idx) => Math.max(idx - 1, 0));
              }
              if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                selectResult(results[activeIndex]!);
              }
            }}
          />
          <p className="mt-1 text-xs text-gray-500">Cmd+K / Ctrl+K anywhere · ↑↓ navigate · Enter open</p>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {loading ? <p className="px-4 py-2 text-sm text-gray-500">Searching…</p> : null}
          {!loading && query.trim().length < 2 && recent.length > 0 ? (
            <div className="px-4 pb-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    onClick={() => setQuery(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!loading && results.length === 0 && query.trim().length >= 2 ? (
            <p className="px-4 py-2 text-sm text-gray-500">No matches</p>
          ) : null}
          {results.map((result, index) => (
            <SearchResultItem
              key={result.uuid}
              result={result}
              active={index === activeIndex}
              onSelect={selectResult}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
