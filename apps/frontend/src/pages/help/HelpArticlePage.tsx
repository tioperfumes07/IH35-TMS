import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "../../components/layout/PageHeader";
import { getHelpArticle } from "../../help/helpCenterContent";

export function HelpArticlePage() {
  const { slug = "" } = useParams();
  const article = useMemo(() => getHelpArticle(slug), [slug]);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  if (!article) {
    return (
      <div className="space-y-3">
        <PageHeader title="Article not found" />
        <p className="text-sm text-gray-700">
          <Link to="/help" className="text-slate-700 hover:underline">
            Back to help home
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={article.title} subtitle={article.category} />
      <article className="prose prose-sm max-w-none text-gray-900">
        <ReactMarkdown>{article.body}</ReactMarkdown>
      </article>
      <section aria-label="Feedback" className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Was this helpful?</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={() => setFeedback("up")}
            aria-pressed={feedback === "up"}
          >
            Yes
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={() => setFeedback("down")}
            aria-pressed={feedback === "down"}
          >
            No
          </button>
        </div>
        {feedback ? (
          <p className="mt-2 text-sm text-gray-600" role="status">
            Thanks — we use this to prioritize documentation updates.
          </p>
        ) : null}
        <p className="mt-3 text-sm">
          <Link to="/help" className="text-slate-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
            ← All articles
          </Link>
        </p>
      </section>
    </div>
  );
}
