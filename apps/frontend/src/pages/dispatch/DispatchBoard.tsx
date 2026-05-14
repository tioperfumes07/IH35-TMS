import { DispatchList, type DispatchListProps } from "../../components/dispatch/DispatchList";

export type DispatchBoardProps = Omit<DispatchListProps, "showEtaColumn">;

/** List view with backend-authoritative ETA column (P5-T20). */
export function DispatchBoard(props: DispatchBoardProps) {
  return <DispatchList {...props} showEtaColumn />;
}
