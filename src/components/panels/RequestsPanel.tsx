import { useState } from "react";
import type { FamilyData, FamilyRequest } from "../../lib/familyDataTypes";
import { getMemberName } from "../../lib/familyUiHelpers";
import { getCurrentFamilyRole } from "../../lib/familyDataApi";
import { decideRequest } from "../../lib/familyMutations";
import { RequestFormModal } from "../forms/RequestFormModal";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
};

function requestTone(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "conditional") return "info" as const;
  return "warning" as const;
}

function RequestCard({
  data,
  request,
  conditionText,
  onConditionText,
  onDecide,
}: {
  data: FamilyData;
  request: FamilyRequest;
  conditionText: string;
  onConditionText: (value: string) => void;
  onDecide: (requestId: string, status: "approved" | "rejected" | "conditional") => void;
}) {
  const pending = request.status === "pending";

  return (
    <article className={`fd-request-card ${pending ? "pending" : ""}`}>
      <div className="fd-request-main">
        <div className="fd-request-title-row">
          <strong>{request.title}</strong>
          <StatusPill label={request.status} tone={requestTone(request.status)} />
        </div>
        <div className="fd-muted">{getMemberName(data, request.requester_id)} · {request.request_type}</div>
        {request.detail && <div className="fd-request-detail">{request.detail}</div>}
        {request.condition_text && <div className="fd-request-note">Condition: {request.condition_text}</div>}
      </div>

      {pending && (
        <div className="fd-request-actions">
          <button onClick={() => onDecide(request.id, "approved")} className="fd-button small primary">Approve</button>
          <button onClick={() => onDecide(request.id, "rejected")} className="fd-button small subtle">No</button>
          <details className="fd-disclosure quiet fd-request-condition">
            <summary>Approve with note</summary>
            <div className="fd-request-condition-row">
              <input
                value={conditionText}
                onChange={(event) => onConditionText(event.target.value)}
                placeholder="e.g. after homework is done"
                className="fd-input"
              />
              <button onClick={() => onDecide(request.id, "conditional")} className="fd-button small">Save</button>
            </div>
          </details>
        </div>
      )}
    </article>
  );
}

export function RequestsPanel({ data, onRefresh }: Props) {
  const [conditionText, setConditionText] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const { showToast, showError } = useToast();

  async function decide(requestId: string, status: "approved" | "rejected" | "conditional") {
    try {
      const role = await getCurrentFamilyRole();
      await decideRequest({
        requestId,
        familyId: data.family.id,
        status,
        decidedBy: role.member_id,
        conditionText: status === "conditional" ? conditionText : null,
      });
      setConditionText("");
      await onRefresh?.();
      showToast(status === "approved" ? "Request approved." : status === "rejected" ? "Request declined." : "Condition saved.", "success");
    } catch (error) {
      showError(error);
    }
  }

  const pending = data.requests.filter((request) => request.status === "pending");
  const past = data.requests.filter((request) => request.status !== "pending");

  return (
    <>
      <div className="fd-grid fd-requests-panel">
        <PanelCard raised>
          <SectionTitle
            title="Requests"
            subtitle={pending.length ? `${pending.length} waiting for you` : "Nothing waiting"}
            right={<button onClick={() => setFormOpen(true)} className="fd-button primary">Add request</button>}
          />

          {data.requests.length === 0 ? (
            <EmptyState text="No requests yet." />
          ) : (
            <div className="fd-request-list">
              {pending.length > 0 ? (
                pending.map((request) => (
                  <RequestCard
                    key={request.id}
                    data={data}
                    request={request}
                    conditionText={conditionText}
                    onConditionText={setConditionText}
                    onDecide={decide}
                  />
                ))
              ) : (
                <div className="fd-empty">No new requests.</div>
              )}

              {past.length > 0 && (
                <details className="fd-disclosure quiet">
                  <summary>Past requests · {past.length}</summary>
                  <div className="fd-request-list" style={{ marginTop: 10 }}>
                    {past.map((request) => (
                      <RequestCard
                        key={request.id}
                        data={data}
                        request={request}
                        conditionText={conditionText}
                        onConditionText={setConditionText}
                        onDecide={decide}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </PanelCard>
      </div>

      <RequestFormModal open={formOpen} data={data} onClose={() => setFormOpen(false)} onSaved={onRefresh} />
    </>
  );
}
