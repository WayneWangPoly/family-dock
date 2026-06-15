import type { FamilyData } from "../../lib/familyDataTypes";
import {
  buildGoogleMapsUrl,
  formatDate,
  formatDateTime,
  formatTime,
  getActiveHomework,
  getEventsForDate,
  getHomeworkProgress,
  getMemberName,
  getOpenPayments,
  getPlace,
  getPlaceName,
  getStopsForDate,
  todayKey,
} from "../../lib/familyUiHelpers";
import { detectAllConflicts } from "../../lib/conflictEngine";
import { PanelCard, SectionTitle, StatusPill } from "./shared";

type Props = {
  data: FamilyData;
};

export function TodayPanel({ data }: Props) {
  const today = todayKey();
  const todayEvents = getEventsForDate(data.calendarEvents, today);
  const todayStops = getStopsForDate(data.routeStops, today);
  const openPayments = getOpenPayments(data.payments);
  const activeHomework = getActiveHomework(data.homeworkTasks);
  const requestsPending = data.requests.filter((request) => request.status === "pending");
  const conflicts = detectAllConflicts(data, 1);
  const unpaidAmount = openPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const nextEvent = todayEvents.find((event) => new Date(event.start_at).getTime() >= Date.now()) ?? todayEvents[0];

  return (
    <div className="fd-grid fd-today-page">
      <PanelCard raised>
        <SectionTitle
          title={nextEvent ? `Next at ${formatTime(nextEvent.start_at)}` : "Today"}
          subtitle={formatDate(today)}
          right={conflicts.length ? <StatusPill label={`${conflicts.length} check`} tone="warning" /> : undefined}
        />

        {nextEvent ? (
          <div className="fd-hero-next">
            <div>
              <strong>{nextEvent.title}</strong>
              <span>{getMemberName(data, nextEvent.child_id)} · {getPlaceName(data, nextEvent.place_id)}</span>
            </div>
            <div className="fd-hero-time">{formatTime(nextEvent.start_at)}</div>
          </div>
        ) : null}
      </PanelCard>

      <div className="fd-summary-strip">
        <div className="fd-summary-chip">
          <strong>{todayEvents.length}</strong>
          <span>events</span>
        </div>
        <div className="fd-summary-chip">
          <strong>{todayStops.length}</strong>
          <span>stops</span>
        </div>
        <div className="fd-summary-chip">
          <strong>{activeHomework.length}</strong>
          <span>homework</span>
        </div>
        <div className="fd-summary-chip">
          <strong>${unpaidAmount.toFixed(0)}</strong>
          <span>unpaid</span>
        </div>
      </div>

      {todayEvents.length > 0 && (
        <PanelCard>
          <SectionTitle title="Today agenda" />
          <div className="fd-agenda-list">
            {todayEvents.map((event) => (
              <article key={event.id} className="fd-agenda-item">
                <div className="fd-agenda-time">{formatTime(event.start_at)}</div>
                <div className="fd-agenda-copy">
                  <strong>{event.title}</strong>
                  <span>{getMemberName(data, event.child_id)} · {getPlaceName(data, event.place_id)}</span>
                  {event.teacher_name && <span>Teacher: {event.teacher_name}</span>}
                </div>
              </article>
            ))}
          </div>
        </PanelCard>
      )}

      {todayStops.length > 0 && (
        <PanelCard>
          <SectionTitle title="Pickup route" subtitle="Today" />
          <div className="fd-feed-list">
            {todayStops.map((stop) => {
              const place = getPlace(data, stop.place_id);
              const url = buildGoogleMapsUrl(place);
              return (
                <article key={stop.id} className="fd-feed-item">
                  <div className="fd-feed-icon">{stop.stop_order}</div>
                  <div className="fd-feed-copy">
                    <strong>{place?.name ?? "未指定地点"}</strong>
                    <span>{stop.stop_type} · {getMemberName(data, stop.responsible_member_id)}</span>
                  </div>
                  {url && <a href={url} target="_blank" rel="noreferrer" className="fd-button small">Map</a>}
                </article>
              );
            })}
          </div>
        </PanelCard>
      )}

      {activeHomework.length + requestsPending.length + openPayments.length > 0 && (
        <PanelCard>
          <SectionTitle title="Needs attention" />
          <div className="fd-feed-list">
            {activeHomework.slice(0, 3).map((task) => {
              const progress = getHomeworkProgress(task);
              return (
                <article key={task.id} className="fd-feed-item warning">
                  <div className="fd-feed-icon">•</div>
                  <div className="fd-feed-copy">
                    <strong>{task.title}</strong>
                    <span>{getMemberName(data, task.child_id)} · {progress.done}/{progress.total} done · due {formatDateTime(task.due_at)}</span>
                  </div>
                </article>
              );
            })}
            {requestsPending.slice(0, 2).map((request) => (
              <article key={request.id} className="fd-feed-item info">
                <div className="fd-feed-icon">i</div>
                <div className="fd-feed-copy">
                  <strong>{request.title}</strong>
                  <span>{getMemberName(data, request.requester_id)} · request</span>
                </div>
              </article>
            ))}
            {openPayments.slice(0, 2).map((payment) => (
              <article key={payment.id} className="fd-feed-item warning">
                <div className="fd-feed-icon">$</div>
                <div className="fd-feed-copy">
                  <strong>{payment.title}</strong>
                  <span>{getMemberName(data, payment.child_id)} · ${payment.amount} · due {payment.due_date ?? "not set"}</span>
                </div>
              </article>
            ))}
          </div>
        </PanelCard>
      )}
    </div>
  );
}
