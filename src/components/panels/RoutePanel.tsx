import type { FamilyData } from "../../lib/familyDataTypes";
import { SmartRouteDeparturePanel } from "./SmartRouteDeparturePanel";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
};

export function RoutePanel({ data }: Props) {
  return <SmartRouteDeparturePanel data={data} />;
}
