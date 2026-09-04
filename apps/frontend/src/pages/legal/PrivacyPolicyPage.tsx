import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import privacyPolicySource from "@legal/privacy-policy.md?raw";
import { PageHeader } from "../../components/layout/PageHeader";

export function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-900">IH 35 Dispatch</span>
          <Link className="text-xs text-slate-700 hover:underline" to="/login">
            Office sign-in
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <PageHeader breadcrumb={["Legal", "Privacy Policy"]} title="Privacy Policy" backHref="/login" />
      </div>
      <article className="mx-auto max-w-3xl px-4 pb-10 pt-0 [&_a]:text-slate-700 [&_a]:underline [&_h1:first-child]:hidden [&_h2]:mt-8 [&_h2]:scroll-mt-4 [&_h2]:border-b [&_h2]:border-slate-100 [&_h2]:pb-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:my-1 [&_p]:mt-3 [&_p]:leading-relaxed [&_strong]:text-slate-900 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <ReactMarkdown>{privacyPolicySource}</ReactMarkdown>
      </article>
    </main>
  );
}
