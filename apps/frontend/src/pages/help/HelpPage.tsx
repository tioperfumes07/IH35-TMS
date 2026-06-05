import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { RUNBOOKS } from "./RunbooksIndex";

type HelpTile = {
  title: string;
  description: string;
  to: string;
};

const HELP_TILES: HelpTile[] = [
  {
    title: "Help articles",
    description: "Guides for dispatch, finance, and account tasks.",
    to: "/help",
  },
  {
    title: "Runbooks",
    description: `${RUNBOOKS.length} step-by-step procedures for recurring office workflows.`,
    to: "/help/runbooks",
  },
];

export function HelpPage() {
  return (
    <div className="space-y-4" data-testid="help-page">
      <PageHeader title="Help" subtitle="Articles and operator runbooks" />
      <div className="grid gap-4 md:grid-cols-2">
        {HELP_TILES.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="rounded border border-gray-200 bg-white p-4 hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <h2 className="text-base font-semibold text-gray-900">{tile.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{tile.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
