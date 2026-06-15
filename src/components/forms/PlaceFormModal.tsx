import { useEffect, useState } from "react";
import type { FamilyData, Place } from "../../lib/familyDataTypes";
import { createPlace, updatePlace } from "../../lib/manualMutations";
import { buttonStyle, fieldStyle, formGridStyle, FormModal, inputStyle, primaryButtonStyle } from "./FormModal";

type Props = {
  open: boolean;
  data: FamilyData;
  place?: Place | null;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
};

export function PlaceFormModal({ open, data, place, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [placeType, setPlaceType] = useState("course");
  const [pickupNote, setPickupNote] = useState("");
  const [parkingNote, setParkingNote] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = Boolean(place);

  useEffect(() => {
    if (!open) return;
    setName(place?.name ?? "");
    setAddress(place?.address ?? "");
    setPlaceType(place?.place_type ?? "course");
    setPickupNote(place?.pickup_note ?? "");
    setParkingNote(place?.parking_note ?? "");
    setSafetyNote(place?.safety_note ?? "");
  }, [open, place]);

  async function submit() {
    if (!name.trim()) return alert("Location name is required.");
    setBusy(true);
    try {
      if (place) {
        await updatePlace({
          familyId: data.family.id,
          placeId: place.id,
          name: name.trim(),
          address: address || null,
          placeType,
          pickupNote: pickupNote || null,
          parkingNote: parkingNote || null,
          safetyNote: safetyNote || null,
        });
      } else {
        await createPlace({
          familyId: data.family.id,
          name: name.trim(),
          address: address || null,
          placeType,
          pickupNote: pickupNote || null,
          parkingNote: parkingNote || null,
          safetyNote: safetyNote || null,
        });
      }
      await onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title={editing ? "Edit location" : "Add location"} open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>Name<input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label style={fieldStyle}>Address<input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        <label style={fieldStyle}>Type
          <select style={inputStyle} value={placeType} onChange={(e) => setPlaceType(e.target.value)}>
            <option value="home">home</option>
            <option value="school">school</option>
            <option value="course">course</option>
            <option value="sport">sport</option>
            <option value="library">library</option>
            <option value="other">other</option>
          </select>
        </label>
        <label style={fieldStyle}>Pickup note<input style={inputStyle} value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} /></label>
        <label style={fieldStyle}>Parking note<input style={inputStyle} value={parkingNote} onChange={(e) => setParkingNote(e.target.value)} /></label>
        <label style={fieldStyle}>Safety note<input style={inputStyle} value={safetyNote} onChange={(e) => setSafetyNote(e.target.value)} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </FormModal>
  );
}
