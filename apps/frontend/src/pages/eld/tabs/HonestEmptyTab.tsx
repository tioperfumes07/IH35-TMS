import { Radio } from "lucide-react";
import { BoardSection } from "../../../components/v3/BoardSection";

type Props = {
  title: string;
  body: string;
  testId: string;
};

/** Reachable tab with an honest empty state — never fabricates rows. */
export function HonestEmptyTab({ title, body, testId }: Props) {
  return (
    <BoardSection title={title} testId={`${testId}-board`}>
      <section
        className="p-6 text-center"
        data-testid={testId}
        data-eld-honest-empty="true"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F7F8FA] text-[#1F2A44]">
          <Radio className="h-6 w-6" />
        </div>
        <p className="mt-1 text-xs text-gray-600">{body}</p>
      </section>
    </BoardSection>
  );
}
