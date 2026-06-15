import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { createRequest } from "../../lib/manualMutations";
import { buttonStyle, fieldStyle, formGridStyle, FormModal, inputStyle, primaryButtonStyle } from "./FormModal";

type Props = {
  open: boolean;
  data: FamilyData;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
};

export function RequestFormModal({ open, data, onClose, onSaved }: Props) {
  const [requesterId, setRequesterId] = useState("");
  const [requestType, setRequestType] = useState("food");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title) return alert("Title is required.");
    setBusy(true);
    try {
      await createRequest({
        familyId: data.family.id,
        requesterId: requesterId || null,
        requestType,
        title,
        detail: detail || null,
      });
      await onSaved?.();
      onClose();
      setTitle("");
      setDetail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title="Add request" open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>Requester
          <select style={inputStyle} value={requesterId} onChange={(e) => setRequesterId(e.target.value)}>
            <option value="">当前登录者</option>
            {data.members.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {member.role}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>Type
          <select style={inputStyle} value={requestType} onChange={(e) => setRequestType(e.target.value)}>
            <option value="food">food</option>
            <option value="outing">outing</option>
            <option value="purchase">purchase</option>
            <option value="schedule_change">schedule change</option>
            <option value="help">help</option>
            <option value="other">other</option>
          </select>
        </label>
        <label style={fieldStyle}>Title<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label style={fieldStyle}>Detail<textarea style={{ ...inputStyle, minHeight: 90 }} value={detail} onChange={(e) => setDetail(e.target.value)} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </FormModal>
  );
}
