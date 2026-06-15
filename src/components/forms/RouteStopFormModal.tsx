import { useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { createRouteStop } from "../../lib/routePlanner";
import { buttonStyle, fieldStyle, formGridStyle, FormModal, inputStyle, primaryButtonStyle } from "./FormModal";

type Props = {
  open: boolean;
  data: FamilyData;
  dateKey: string;
  existingCount: number;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
};

export function RouteStopFormModal({
  open,
  data,
  dateKey,
  existingCount,
  onClose,
  onSaved,
}: Props) {
  const [placeId, setPlaceId] = useState("");
  const [responsibleMemberId, setResponsibleMemberId] = useState("");
  const [stopType, setStopType] = useState("course");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const places = useMemo(() => {
    return [...data.places].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.places]);

  async function submit() {
    if (!placeId) {
      alert("Place is required.");
      return;
    }

    setBusy(true);

    try {
      await createRouteStop({
        familyId: data.family.id,
        stopDate: dateKey,
        stopOrder: existingCount + 1,
        stopType,
        placeId,
        responsibleMemberId: responsibleMemberId || null,
        note: note || null,
      });

      await onSaved?.();
      onClose();
      setPlaceId("");
      setResponsibleMemberId("");
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title="Add route stop" open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>
          Date
          <input style={inputStyle} value={dateKey} readOnly />
        </label>

        <label style={fieldStyle}>
          Place
          <select style={inputStyle} value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
            <option value="">Select place</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>{place.name}</option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          Responsible member
          <select style={inputStyle} value={responsibleMemberId} onChange={(event) => setResponsibleMemberId(event.target.value)}>
            <option value="">Not specified</option>
            {data.members.map((member) => (
              <option key={member.id} value={member.id}>{member.display_name}</option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          Stop type
          <select style={inputStyle} value={stopType} onChange={(event) => setStopType(event.target.value)}>
            <option value="school">school</option>
            <option value="course">course</option>
            <option value="pickup">pickup</option>
            <option value="dropoff">dropoff</option>
            <option value="family">family</option>
            <option value="other">other</option>
          </select>
        </label>

        <label style={fieldStyle}>
          Note
          <input style={inputStyle} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </FormModal>
  );
}
