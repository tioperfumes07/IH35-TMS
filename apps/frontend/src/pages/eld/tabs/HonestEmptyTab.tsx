import { Radio } from "lucide-react";

type Props = {
  title: string;
  body: string;
  testId: string;
};

/** Reachable tab with an honest empty state — never fabricates rows. */
export function HonestEmptyTab({ title, body, testId }: Props) {
  return (
    <section
      className="rounded-sm border border-gray-200 bg-white p-6 text-center"
      data-testid={testId}
      data-eld-honest-empty="true"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
        <Radio className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-xs text-gray-600">{body}</p>
    </section>
  );
}
