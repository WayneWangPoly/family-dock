import { useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { createRequest } from "../../lib/manualMutations";

type Props = {
  data: FamilyData;
  onSaved?: () => Promise<unknown> | unknown;
};

export function ChildQuickRequestForm({ data, onSaved }: Props) {
  const [requestType, setRequestType] = useState("food");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) {
      alert("Please enter what you want to ask.");
      return;
    }

    setBusy(true);

    try {
      await createRequest({
        familyId: data.family.id,
        requesterId: data.role.member_id,
        requestType,
        title,
        detail: detail || null,
      });

      setTitle("");
      setDetail("");
      await onSaved?.();
      alert("Request sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Ask parents</h2>
      <div style={gridStyle}>
        <label style={labelStyle}>
          Type
          <select style={inputStyle} value={requestType} onChange={(event) => setRequestType(event.target.value)}>
            <option value="food">I want to eat...</option>
            <option value="outing">I want to go out...</option>
            <option value="purchase">I need to buy...</option>
            <option value="schedule_change">Schedule change</option>
            <option value="help">I need help</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label style={labelStyle}>
          Request
          <input style={inputStyle} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you want?" />
        </label>

        <label style={labelStyle}>
          Detail
          <textarea style={{ ...inputStyle, minHeight: 80 }} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Tell parents more..." />
        </label>

        <button disabled={busy} onClick={submit} style={buttonStyle}>
          {busy ? "Sending..." : "Send request"}
        </button>
      </div>
    </section>
  );
}

const cardStyle: CSSProperties = {
  background: "rgba(255,255,255,.88)",
  border: "1px solid #eadfd0",
  borderRadius: 24,
  padding: 16,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 13,
  fontWeight: 850,
  color: "#44403c",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 12,
  border: "1px solid #d6d3d1",
  boxSizing: "border-box",
  font: "inherit",
};

const buttonStyle: CSSProperties = {
  padding: "11px 12px",
  borderRadius: 14,
  border: "1px solid #31535c",
  background: "#31535c",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
};
