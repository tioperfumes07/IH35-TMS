import type { MouseEvent } from "react";
import { EntityLink, type EntityKind } from "./EntityLink";
import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";

type Props = {
  kind: EntityKind;
  id: string | null | undefined;
  name: unknown;
  noun: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** data-testid when unresolved (default entity-link-tombstone) */
  tombstoneTestId?: string;
  /** Forwarded to EntityLink when resolved (and overrides tombstone test id when set). */
  "data-testid"?: string;
  /** Text for the resolved link when it is an action ("Open profile"), not the entity's name. The tombstone still
   *  shows the governed label, so an unresolved entity never gets a live-looking action link. */
  linkLabel?: string;
};

/**
 * LV-SAFETY-ENTITYLINK-UNRESOLVED-TOMBSTONE — never mount EntityLink when the
 * display label is the governed "— not visible" / Unknown tombstone (dead drill).
 */
export function EntityLinkOrTombstone({
  kind,
  id,
  name,
  noun,
  className,
  onClick,
  tombstoneTestId = "entity-link-tombstone",
  "data-testid": dataTestId,
  linkLabel,
}: Props) {
  const trimmedId = id != null ? String(id).trim() : "";
  if (!trimmedId) {
    return <span className="text-gray-400">—</span>;
  }
  if (isUnresolvedEntityTombstone(name, trimmedId, noun)) {
    return (
      <span className="text-gray-500" data-testid={dataTestId ?? tombstoneTestId}>
        {entityLabel(name, trimmedId, noun)}
      </span>
    );
  }
  const label = linkLabel ?? (name != null ? String(name).trim() : "");
  return (
    <EntityLink
      kind={kind}
      id={trimmedId}
      label={label}
      className={className}
      onClick={onClick}
      data-testid={dataTestId}
    />
  );
}
