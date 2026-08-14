import { Link } from "react-router-dom";

export type RelatedModuleLink = {
  label: string;
  to: string;
};

type Props = {
  links: RelatedModuleLink[];
  testId: string;
  className?: string;
};

/**
 * A compact, keyboard-native door from one operational module to the real sibling modules
 * that own related work. The links are deliberately routes rather than callbacks so open-in-new-tab,
 * browser history, and route guards all behave normally.
 */
export function RelatedModuleLinks({ links, testId, className = "" }: Props) {
  return (
    <nav
      aria-label="Related modules"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs ${className}`}
      data-testid={testId}
    >
      <span className="font-semibold text-slate-500">Related:</span>
      {links.map((link) => (
        <Link
          key={link.to}
          className="font-medium text-slate-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
          to={link.to}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
