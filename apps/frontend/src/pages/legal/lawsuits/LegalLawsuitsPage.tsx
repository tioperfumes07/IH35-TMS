import { LawsuitsTab } from "../../insurance/LawsuitsTab";
import { LegalModuleTabs } from "../LegalModuleTabs";

/**
 * LEAD 443.332 (owner 10-24 3:47 PM CT): "the lawsuits should only be in lawsuits module, it is unnecessary in insurance."
 * The Lawsuits surface moves from Insurance to Legal — the same LawsuitsTab (same insurance.lawsuit data, same create /
 * detail / legal-matter links), now under the Legal sub-nav. /insurance/lawsuits redirects here, query string kept.
 */
export function LegalLawsuitsPage() {
  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <LegalModuleTabs />
      <LawsuitsTab />
    </div>
  );
}
