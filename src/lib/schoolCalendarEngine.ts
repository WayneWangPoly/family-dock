import type { FamilyData } from "./familyDataTypes";
import { supabase } from "./supabaseClient";

export type FamilyCalendarSetting = {
  id: string;
  family_id: string;
  state_code: "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";
  school_level: "primary" | "secondary" | "mixed" | "custom";
  school_year: number;
  term_week1_start: string | null;
  week_starts_on: number;
  public_school_baseline: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SchoolTermPeriod = {
  id: string;
  family_id: string;
  school_year: number;
  term_number: number;
  term_start: string;
  term_end: string;
  label: string | null;
  is_public_school_baseline: boolean;
  created_at: string;
  updated_at: string;
};

export type CalendarDayOverride = {
  id: string;
  family_id: string;
  override_date: string;
  override_type: "public_holiday" | "school_holiday" | "pupil_free_day" | "exam_day" | "school_day" | "custom";
  title: string;
  state_code: string | null;
  applies_to_member_id: string | null;
  color_tag: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarDayInfo = {
  date: string;
  isSchoolDay: boolean;
  isHoliday: boolean;
  weekNumber: number | null;
  termNumber: number | null;
  labels: string[];
  colorTone: "school" | "holiday" | "exam" | "custom" | "neutral";
};

export function currentSchoolYear() {
  return new Date().getFullYear();
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.floor((b - a) / 86400000);
}

export function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function isWeekend(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

export function computeWeekNumber(termStart: string | null, dateKey: string) {
  if (!termStart) return null;
  const diff = daysBetween(termStart, dateKey);
  if (diff < 0) return null;
  return Math.floor(diff / 7) + 1;
}

export function findTermForDate(terms: SchoolTermPeriod[], dateKey: string) {
  return terms.find((term) => dateKey >= term.term_start && dateKey <= term.term_end) ?? null;
}

export function computeCalendarDayInfo(args: {
  date: string;
  setting: FamilyCalendarSetting | null;
  terms: SchoolTermPeriod[];
  overrides: CalendarDayOverride[];
}): CalendarDayInfo {
  const term = findTermForDate(args.terms, args.date);
  const dateOverrides = args.overrides.filter((item) => item.override_date === args.date);

  const labels: string[] = [];
  let colorTone: CalendarDayInfo["colorTone"] = "neutral";

  const hasHolidayOverride = dateOverrides.some((item) => ["public_holiday", "school_holiday", "pupil_free_day"].includes(item.override_type));
  const hasSchoolDayOverride = dateOverrides.some((item) => item.override_type === "school_day");
  const hasExam = dateOverrides.some((item) => item.override_type === "exam_day");

  for (const item of dateOverrides) {
    labels.push(item.title);
  }

  const inTerm = Boolean(term);
  let isSchoolDay = inTerm && !isWeekend(args.date);
  if (hasHolidayOverride) isSchoolDay = false;
  if (hasSchoolDayOverride) isSchoolDay = true;

  const isHoliday = !isSchoolDay;

  if (hasExam) colorTone = "exam";
  else if (dateOverrides.some((item) => item.override_type === "custom")) colorTone = "custom";
  else if (isSchoolDay) colorTone = "school";
  else if (isHoliday) colorTone = "holiday";

  if (term) labels.unshift(`Term ${term.term_number}`);
  const week = computeWeekNumber(args.setting?.term_week1_start ?? term?.term_start ?? null, args.date);
  if (week !== null && inTerm) labels.unshift(`Week ${week}`);

  return {
    date: args.date,
    isSchoolDay,
    isHoliday,
    weekNumber: inTerm ? week : null,
    termNumber: term?.term_number ?? null,
    labels,
    colorTone,
  };
}

export async function loadFamilyCalendarSetting(familyId: string, schoolYear = currentSchoolYear()) {
  const { data, error } = await supabase
    .from("family_calendar_settings")
    .select("*")
    .eq("family_id", familyId)
    .eq("school_year", schoolYear)
    .maybeSingle();

  if (error) throw error;
  return data as FamilyCalendarSetting | null;
}

export async function upsertFamilyCalendarSetting(args: {
  data: FamilyData;
  setting: Partial<FamilyCalendarSetting> & { school_year: number };
}) {
  const row = {
    family_id: args.data.family.id,
    state_code: args.setting.state_code ?? "SA",
    school_level: args.setting.school_level ?? "primary",
    school_year: args.setting.school_year,
    term_week1_start: args.setting.term_week1_start ?? null,
    week_starts_on: args.setting.week_starts_on ?? 1,
    public_school_baseline: args.setting.public_school_baseline ?? true,
    notes: args.setting.notes ?? null,
  };

  const { data, error } = await supabase
    .from("family_calendar_settings")
    .upsert(row, { onConflict: "family_id,school_year" })
    .select("*")
    .single();

  if (error) throw error;
  return data as FamilyCalendarSetting;
}

export async function loadSchoolTerms(familyId: string, schoolYear = currentSchoolYear()) {
  const { data, error } = await supabase
    .from("school_term_periods")
    .select("*")
    .eq("family_id", familyId)
    .eq("school_year", schoolYear)
    .order("term_number", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SchoolTermPeriod[];
}

export async function upsertSchoolTerm(args: {
  data: FamilyData;
  schoolYear: number;
  termNumber: number;
  termStart: string;
  termEnd: string;
  label?: string | null;
}) {
  const { data, error } = await supabase
    .from("school_term_periods")
    .upsert({
      family_id: args.data.family.id,
      school_year: args.schoolYear,
      term_number: args.termNumber,
      term_start: args.termStart,
      term_end: args.termEnd,
      label: args.label ?? `Term ${args.termNumber}`,
      is_public_school_baseline: true,
    }, { onConflict: "family_id,school_year,term_number" })
    .select("*")
    .single();

  if (error) throw error;
  return data as SchoolTermPeriod;
}

export async function loadCalendarOverrides(familyId: string, start: string, end: string) {
  const { data, error } = await supabase
    .from("calendar_day_overrides")
    .select("*")
    .eq("family_id", familyId)
    .gte("override_date", start)
    .lte("override_date", end)
    .order("override_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CalendarDayOverride[];
}

export async function createCalendarOverride(args: {
  data: FamilyData;
  overrideDate: string;
  overrideType: CalendarDayOverride["override_type"];
  title: string;
  stateCode?: string | null;
  appliesToMemberId?: string | null;
  colorTag?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase
    .from("calendar_day_overrides")
    .insert({
      family_id: args.data.family.id,
      override_date: args.overrideDate,
      override_type: args.overrideType,
      title: args.title,
      state_code: args.stateCode ?? null,
      applies_to_member_id: args.appliesToMemberId ?? null,
      color_tag: args.colorTag ?? null,
      notes: args.notes ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as CalendarDayOverride;
}
