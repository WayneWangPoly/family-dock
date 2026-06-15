import type { FamilyData } from "../../lib/familyDataTypes";
import { SchoolCalendarEnginePanel } from "./SchoolCalendarEnginePanel";

type Props = {
  data: FamilyData;
};

export function CalendarEnginePanel({ data }: Props) {
  return <SchoolCalendarEnginePanel data={data} />;
}
