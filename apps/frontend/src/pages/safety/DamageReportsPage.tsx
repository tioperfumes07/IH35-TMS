import { DamageReportsSurface } from "./components/DamageReportsSurface";

type Props = {
  operatingCompanyId: string;
};

export function DamageReportsPage({ operatingCompanyId }: Props) {
  return <DamageReportsSurface operatingCompanyId={operatingCompanyId} />;
}
