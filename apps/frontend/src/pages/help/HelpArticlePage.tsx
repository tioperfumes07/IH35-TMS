import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "../../components/layout/PageHeader";
import { getHelpArticle } from "../../help/helpCenterContent";

type HelpFeedback = "up" | "down";

/** localStorage key — article slug is the stable id (frontend-only Help). */
export function helpFeedbackStorageKey(articleId: string): string {
  return `help_feedback:${articleId}`;
}

function readHelpFeedback(articleId: string): HelpFeedback | null {
  if (!articleId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(helpFeedbackStorageKey(articleId));
    if (raw === "up" || raw === "down") return raw;
  } catch {
    // private / blocked storage
  }
  return null;
}

function writeHelpFeedback(articleId: string, value: HelpFeedback): boolean {
  if (!articleId || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(helpFeedbackStorageKey(articleId), value);
    return true;
  } catch {
    return false;
  }
}

export function HelpArticlePage() {
  const { slug = "" } = useParams();
  const article = useMemo(() => getHelpArticle(slug), [slug]);
  const articleKey = article?.slug ?? slug;
  const [feedback, setFeedback] = useState<HelpFeedback | null>(() => readHelpFeedback(articleKey));
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Restore when navigating between articles (same page component, new slug).
  useEffect(() => {
    setFeedback(readHelpFeedback(articleKey));
  }, [articleKey]);

  const chooseFeedback = (value: HelpFeedback) => {
    setFeedbackError(null);
    if (writeHelpFeedback(articleKey, value)) {
      setFeedback(value);
    } else {
      setFeedbackError("Could not save your feedback. Check browser storage permissions and try again.");
    }
  };

  if (!article) {
    return (
      <div className="space-y-3">
        <PageHeader breadcrumb={["Help"]} title="Article not found" />
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
      <PageHeader breadcrumb={["Help", article.category]} title={article.title} subtitle={article.category} />
      <article className="prose prose-sm max-w-none text-gray-900">
        <ReactMarkdown>{article.body}</ReactMarkdown>
      </article>
      <section aria-label="Feedback" className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Was this helpful?</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={() => chooseFeedback("up")}
            aria-pressed={feedback === "up"}
          >
            Yes
          </button>
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={() => chooseFeedback("down")}
            aria-pressed={feedback === "down"}
          >
            No
          </button>
        </div>
        {feedback ? (
          <p className="mt-2 text-sm text-gray-600" role="status">
            Thanks for the feedback.
          </p>
        ) : null}
        {feedbackError ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {feedbackError}
          </p>
        ) : null}
        <p className="mt-3 text-sm">
          <Link to="/help" className="text-slate-700 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400">
            ← All articles
          </Link>
        </p>
      </section>
    </div>
  );
}
