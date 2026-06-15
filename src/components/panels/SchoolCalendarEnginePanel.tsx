import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  addDays,
  computeCalendarDayInfo,
  createCalendarOverride,
  currentSchoolYear,
  loadCalendarOverrides,
  loadFamilyCalendarSetting,
  loadSchoolTerms,
  toDateKey,
  upsertFamilyCalendarSetting,
  upsertSchoolTerm,
} from "../../lib/schoolCalendarEngine";
import type { CalendarDayOverride, FamilyCalendarSetting, SchoolTermPeriod } from "../../lib/schoolCalendarEngine";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

export function SchoolCalendarEnginePanel({ data }: Props) {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [setting, setSetting] = useState<FamilyCalendarSetting | null>(null);
  const [terms, setTerms] = useState<SchoolTermPeriod[]>([]);
  const [overrides, setOverrides] = useState<CalendarDayOverride[]>([]);
  const [overrideDate, setOverrideDate] = useState(toDateKey(new Date()));
  const [overrideType, setOverrideType] = useState<CalendarDayOverride["override_type"]>("pupil_free_day");
  const [overrideTitle, setOverrideTitle] = useState("Pupil free day");
  const [busy, setBusy] = useState(false);
  const { showToast, showError } = useToast();

  const previewDates = useMemo(() => {
    const start = setting?.term_week1_start ?? terms[0]?.term_start ?? toDateKey(new Date());
    return Array.from({ length: 21 }, (_, index) => addDays(start, index));
  }, [setting?.term_week1_start, terms]);

  async function refresh() {
    try {
      const [settingRow, termRows] = await Promise.all([
        loadFamilyCalendarSetting(data.family.id, schoolYear),
        loadSchoolTerms(data.family.id, schoolYear),
      ]);

      setSetting(settingRow);
      setTerms(termRows);

      const start = termRows[0]?.term_start ?? `${schoolYear}-01-01`;
      const end = termRows[3]?.term_end ?? `${schoolYear}-12-31`;
      setOverrides(await loadCalendarOverrides(data.family.id, start, end));
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id, schoolYear]);

  async function saveSetting() {
    setBusy(true);
    try {
      const saved = await upsertFamilyCalendarSetting({
        data,
        setting: {
          school_year: schoolYear,
          state_code: setting?.state_code ?? "SA",
          school_level: setting?.school_level ?? "primary",
          term_week1_start: setting?.term_week1_start ?? terms[0]?.term_start ?? null,
          week_starts_on: setting?.week_starts_on ?? 1,
          public_school_baseline: setting?.public_school_baseline ?? true,
          notes: setting?.notes ?? null,
        },
      });

      setSetting(saved);
      showToast("Calendar setting saved.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function saveTerm(termNumber: number, start: string, end: string) {
    try {
      await upsertSchoolTerm({
        data,
        schoolYear,
        termNumber,
        termStart: start,
        termEnd: end,
        label: `Term ${termNumber}`,
      });
      await refresh();
      showToast(`Term ${termNumber} saved.`, "success");
    } catch (error) {
      showError(error);
    }
  }

  async function addOverride() {
    if (!overrideDate || !overrideTitle.trim()) {
      showToast("Override date and title are required.", "info");
      return;
    }

    try {
      await createCalendarOverride({
        data,
        overrideDate,
        overrideType,
        title: overrideTitle,
        stateCode: setting?.state_code ?? "SA",
      });
      await refresh();
      showToast("Calendar override added.", "success");
    } catch (error) {
      showError(error);
    }
  }

  function getTerm(termNumber: number) {
    return terms.find((term) => term.term_number === termNumber);
  }

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="School term / week engine"
          subtitle="设置州、学段、Term 日期和 Week 1 起点，供 Calendar 显示学周和假期"
          right={<StatusPill label="configurable" tone="info" />}
        />

        <div className="fd-alert warning">
          这里不硬编码澳洲各州每年的官方日期。请以学校/州教育部门公布日期为准输入；私校可以单独调整。
        </div>

        <div className="fd-grid two" style={{ marginTop: 14 }}>
          <label className="fd-field">
            School year
            <input className="fd-input" type="number" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))} />
          </label>

          <label className="fd-field">
            State
            <select className="fd-select" value={setting?.state_code ?? "SA"} onChange={(event) => setSetting({ ...(setting as any), state_code: event.target.value })}>
              {["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>

          <label className="fd-field">
            School level
            <select className="fd-select" value={setting?.school_level ?? "primary"} onChange={(event) => setSetting({ ...(setting as any), school_level: event.target.value })}>
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
              <option value="mixed">mixed</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label className="fd-field">
            Term Week 1 Day 1
            <input
              className="fd-input"
              type="date"
              value={setting?.term_week1_start ?? ""}
              onChange={(event) => setSetting({ ...(setting as any), term_week1_start: event.target.value || null })}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button disabled={busy} onClick={saveSetting} className="fd-button primary">
            {busy ? "Saving..." : "Save settings"}
          </button>
          <button onClick={refresh} className="fd-button">Refresh</button>
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Term periods"
          subtitle="输入 Term 1–4 的开始和结束日期"
          right={<StatusPill label={`${terms.length}/4 terms`} tone={terms.length === 4 ? "success" : "warning"} />}
        />

        <div className="fd-grid">
          {[1, 2, 3, 4].map((termNumber) => {
            const term = getTerm(termNumber);
            return (
              <div key={termNumber} className="fd-row wrap">
                <strong style={{ minWidth: 72 }}>Term {termNumber}</strong>
                <input
                  className="fd-input"
                  type="date"
                  defaultValue={term?.term_start ?? ""}
                  onBlur={(event) => {
                    const start = event.target.value;
                    const end = (document.getElementById(`term-${termNumber}-end`) as HTMLInputElement | null)?.value;
                    if (start && end) saveTerm(termNumber, start, end);
                  }}
                  style={{ maxWidth: 180 }}
                />
                <input
                  id={`term-${termNumber}-end`}
                  className="fd-input"
                  type="date"
                  defaultValue={term?.term_end ?? ""}
                  onBlur={(event) => {
                    const end = event.target.value;
                    const start = (event.currentTarget.parentElement?.querySelector("input[type=date]") as HTMLInputElement | null)?.value;
                    if (start && end) saveTerm(termNumber, start, end);
                  }}
                  style={{ maxWidth: 180 }}
                />
                <span className="fd-muted">{term?.label ?? "not set"}</span>
              </div>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Day overrides"
          subtitle="手动添加 public holiday、pupil free day、exam day、school day"
          right={<StatusPill label={`${overrides.length} overrides`} tone="info" />}
        />

        <div className="fd-grid two">
          <label className="fd-field">
            Date
            <input className="fd-input" type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} />
          </label>

          <label className="fd-field">
            Type
            <select className="fd-select" value={overrideType} onChange={(event) => setOverrideType(event.target.value as any)}>
              <option value="public_holiday">public_holiday</option>
              <option value="school_holiday">school_holiday</option>
              <option value="pupil_free_day">pupil_free_day</option>
              <option value="exam_day">exam_day</option>
              <option value="school_day">school_day</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label className="fd-field">
            Title
            <input className="fd-input" value={overrideTitle} onChange={(event) => setOverrideTitle(event.target.value)} />
          </label>
        </div>

        <button onClick={addOverride} className="fd-button primary" style={{ marginTop: 12 }}>Add override</button>

        {overrides.length === 0 ? (
          <EmptyState text="暂无 override。" />
        ) : (
          <div className="fd-grid" style={{ marginTop: 14 }}>
            {overrides.slice(0, 12).map((item) => (
              <div key={item.id} className="fd-row wrap">
                <strong>{item.override_date}</strong>
                <StatusPill label={item.override_type} tone={item.override_type === "exam_day" ? "warning" : "info"} />
                <span>{item.title}</span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="21-day preview"
          subtitle="检查 Week number / school day / holiday 是否符合预期"
        />

        <div className="fd-grid">
          {previewDates.map((dateKey) => {
            const info = computeCalendarDayInfo({ date: dateKey, setting, terms, overrides });
            return (
              <div key={dateKey} className="fd-row wrap">
                <strong style={{ minWidth: 110 }}>{dateKey}</strong>
                <StatusPill label={info.isSchoolDay ? "school day" : "holiday"} tone={info.isSchoolDay ? "success" : "warning"} />
                {info.weekNumber && <StatusPill label={`Week ${info.weekNumber}`} tone="info" />}
                {info.termNumber && <StatusPill label={`Term ${info.termNumber}`} tone="info" />}
                <span className="fd-muted">{info.labels.join(" · ") || "no labels"}</span>
              </div>
            );
          })}
        </div>
      </PanelCard>
    </div>
  );
}
