import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { createCalendarEvent } from "../../lib/manualMutations";
import { buttonStyle, fieldStyle, formGridStyle, FormModal, inputStyle, primaryButtonStyle } from "./FormModal";

type Props = {
  open: boolean;
  data: FamilyData;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
};

export function EventFormModal({ open, data, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [childId, setChildId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [eventType, setEventType] = useState("course");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title || !startAt) return alert("Title and start time are required.");
    setBusy(true);
    try {
      await createCalendarEvent({
        familyId: data.family.id,
        childId: childId || null,
        placeId: placeId || null,
        title,
        eventType,
        startAt,
        endAt: endAt || null,
        teacherName: teacherName || null,
      });
      await onSaved?.();
      onClose();
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title="Add event" open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>Title<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label style={fieldStyle}>Child / member
          <select style={inputStyle} value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">未指定</option>
            {data.members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>Place
          <select style={inputStyle} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">未指定</option>
            {data.places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>Type
          <select style={inputStyle} value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="course">course</option>
            <option value="school">school</option>
            <option value="family">family</option>
            <option value="homework">homework</option>
            <option value="other">other</option>
          </select>
        </label>
        <label style={fieldStyle}>Start<input style={inputStyle} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
        <label style={fieldStyle}>End<input style={inputStyle} type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
        <label style={fieldStyle}>Teacher / Coach<input style={inputStyle} value={teacherName} onChange={(e) => setTeacherName(e.target.value)} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </FormModal>
  );
}
