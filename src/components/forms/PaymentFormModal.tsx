import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { createPayment } from "../../lib/manualMutations";
import { buttonStyle, fieldStyle, formGridStyle, FormModal, inputStyle, primaryButtonStyle } from "./FormModal";

type Props = {
  open: boolean;
  data: FamilyData;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
};

export function PaymentFormModal({ open, data, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [childId, setChildId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [payTo, setPayTo] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title || !amount) return alert("Title and amount are required.");
    setBusy(true);
    try {
      await createPayment({
        familyId: data.family.id,
        childId: childId || null,
        title,
        amount: Number(amount),
        dueDate: dueDate || null,
        payTo: payTo || null,
        reference: reference || null,
      });
      await onSaved?.();
      onClose();
      setTitle("");
      setAmount("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title="Add payment" open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>Title<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label style={fieldStyle}>Child / member
          <select style={inputStyle} value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">未指定</option>
            {data.members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>Amount<input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label style={fieldStyle}>Due date<input style={inputStyle} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label style={fieldStyle}>Pay to<input style={inputStyle} value={payTo} onChange={(e) => setPayTo(e.target.value)} /></label>
        <label style={fieldStyle}>Reference<input style={inputStyle} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </FormModal>
  );
}
