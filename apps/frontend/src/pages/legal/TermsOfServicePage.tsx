import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import termsSource from "@legal/terms-of-service.md?raw";
import { PageHeader } from "../../components/layout/PageHeader";

export function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-white text-[#0F1219]">
      <header className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#0F1219]">IH 35 Dispatch</span>
          <Link className="text-xs text-[#1F2A44] hover:underline" to="/login">
            Office sign-in
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <PageHeader breadcrumb={["Legal", "Terms of Service"]} title="Terms of Service" backHref="/login" />
      </div>
      <article className="mx-auto max-w-3xl px-4 pb-10 pt-0 [&_a]:text-[#1F2A44] [&_a]:underline [&_h1:first-child]:hidden [&_h2]:mt-8 [&_h2]:scroll-mt-4 [&_h2]:border-b [&_h2]:border-[#E5E7EB] [&_h2]:pb-2 [&_h2]:text-page-title [&_h2]:font-semibold [&_h2]:text-[#0F1219] [&_h3]:mt-6 [&_h3]:text-page-title [&_h3]:font-semibold [&_h3]:text-[#0F1219] [&_li]:my-1 [&_p]:mt-3 [&_p]:leading-relaxed [&_strong]:text-[#0F1219] [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <ReactMarkdown>{termsSource}</ReactMarkdown>
      </article>
    </main>
  );
}
