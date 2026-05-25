import { FileText } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";

export function DocsPage() {
  return (
    <div className="space-y-3">
      <PageHeader title="Documents" subtitle="Company documents by category" />
      <section className="rounded border border-gray-200 bg-white p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <FileText className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">No documents loaded</h2>
        <p className="mt-1 text-sm text-gray-600">Company documents by category will appear here after upload and indexing.</p>
      </section>
    </div>
  );
}
