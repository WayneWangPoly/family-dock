import type { FamilyData } from "./familyDataTypes";
import {
  addDays,
  computeCalendarDayInfo,
  currentSchoolYear,
  loadCalendarOverrides,
  loadFamilyCalendarSetting,
  loadSchoolTerms,
  toDateKey,
} from "./schoolCalendarEngine";
import type {
  CalendarDayInfo,
  CalendarDayOverride,
  FamilyCalendarSetting,
  SchoolTermPeriod,
} from "./schoolCalendarEngine";

export type CalendarOverlayBundle = {
  setting: FamilyCalendarSetting | null;
  terms: SchoolTermPeriod[];
  overrides: CalendarDayOverride[];
  days: CalendarDayInfo[];
};

export function getMonthRange(year: number, monthIndexZeroBased: number) {
  const start = new Date(year, monthIndexZeroBased, 1);
  const end = new Date(year, monthIndexZeroBased + 1, 0);

  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

export function getCalendarGridRange(year: number, monthIndexZeroBased: number) {
  const first = new Date(year, monthIndexZeroBased, 1);
  const last = new Date(year, monthIndexZeroBased + 1, 0);

  const gridStart = new Date(first);
  const firstDay = gridStart.getDay();
  const offsetToMonday = firstDay === 0 ? 6 : firstDay - 1;
  gridStart.setDate(gridStart.getDate() - offsetToMonday);

  const gridEnd = new Date(last);
  const lastDay = gridEnd.getDay();
  const offsetToSunday = lastDay === 0 ? 0 : 7 - lastDay;
  gridEnd.setDate(gridEnd.getDate() + offsetToSunday);

  return {
    start: toDateKey(gridStart),
    end: toDateKey(gridEnd),
  };
}

export async function loadCalendarOverlayBundle(args: {
  data: FamilyData;
  schoolYear?: number;
  start: string;
  end: string;
}) {
  const schoolYear = args.schoolYear ?? currentSchoolYear();

  const [setting, terms, overrides] = await Promise.all([
    loadFamilyCalendarSetting(args.data.family.id, schoolYear),
    loadSchoolTerms(args.data.family.id, schoolYear),
    loadCalendarOverrides(args.data.family.id, args.start, args.end),
  ]);

  const totalDays = Math.max(1, Math.min(370, Math.abs(daysBetween(args.start, args.end)) + 1));
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(args.start, index);
    return computeCalendarDayInfo({
      date,
      setting,
      terms,
      overrides,
    });
  });

  return {
    setting,
    terms,
    overrides,
    days,
  } as CalendarOverlayBundle;
}

export function daysBetween(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.floor((b - a) / 86400000);
}

export function groupDaysByWeek(days: CalendarDayInfo[]) {
  const weeks: CalendarDayInfo[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function overlayToneClass(tone: CalendarDayInfo["colorTone"]) {
  if (tone === "school") return "fd-cal-school";
  if (tone === "holiday") return "fd-cal-holiday";
  if (tone === "exam") return "fd-cal-exam";
  if (tone === "custom") return "fd-cal-custom";
  return "fd-cal-neutral";
}

export function getEventsForDateLoose(data: FamilyData, dateKey: string) {
  return data.calendarEvents
    .filter((event) => event.status !== "cancelled")
    .filter((event) => event.start_at?.slice(0, 10) === dateKey)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}
