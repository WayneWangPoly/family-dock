import { useEffect, useState } from "react";
import type { FamilyData, FamilyMember, Place } from "../../lib/familyDataTypes";
import { buildGoogleMapsUrl } from "../../lib/familyUiHelpers";
import { deletePlace } from "../../lib/manualMutations";
import { deleteMember } from "../../lib/familyDataApi";
import { PlaceFormModal } from "../forms/PlaceFormModal";
import { MemberFormModal } from "../forms/MemberFormModal";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
  initialView?: "places" | "people";
};

function PlaceCard({ place, onEdit, onDelete }: {
  place: Place;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
}) {
  const url = buildGoogleMapsUrl(place);

  return (
    <article className="fd-place-card">
      <div className="fd-place-main">
        <div className="fd-place-title-row">
          <strong>{place.name}</strong>
          {place.place_type && <StatusPill label={place.place_type} tone="info" />}
        </div>
        <div className="fd-place-address">{place.address || "No address yet"}</div>
        {place.pickup_note && <div className="fd-place-note">Pickup: {place.pickup_note}</div>}
        {place.parking_note && <div className="fd-place-note">Parking: {place.parking_note}</div>}
      </div>

      <div className="fd-place-actions">
        {url && <a href={url} target="_blank" rel="noreferrer" className="fd-button small">Map</a>}
        <button onClick={() => onEdit(place)} className="fd-button small primary">Edit</button>
        <button onClick={() => onDelete(place)} className="fd-button small subtle">Remove</button>
      </div>
    </article>
  );
}

function PersonCard({ member, currentMemberId, onEdit, onDelete }: {
  member: FamilyMember;
  currentMemberId: string | null;
  onEdit: (member: FamilyMember) => void;
  onDelete: (member: FamilyMember) => void;
}) {
  return (
    <article className="fd-person-row">
      <div style={{ minWidth: 0 }}>
        <strong>{member.display_name}</strong>
        <div className="fd-muted">
          {member.can_login ? "Can sign in" : "No login"}
          {member.email ? ` · ${member.email}` : ""}
        </div>
      </div>
      <div className="fd-place-actions">
        <StatusPill label={member.role} tone="info" />
        <button className="fd-button small primary" onClick={() => onEdit(member)}>Edit</button>
        {member.id !== currentMemberId && <button className="fd-button small subtle" onClick={() => onDelete(member)}>Remove</button>}
      </div>
    </article>
  );
}

export function MembersPlacesPanel({ data, onRefresh, initialView = "places" }: Props) {
  const [view, setView] = useState<"places" | "people">(initialView);
  const [placeFormOpen, setPlaceFormOpen] = useState(false);
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const { showToast, showError } = useToast();

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  function openAddPlace() {
    setEditingPlace(null);
    setPlaceFormOpen(true);
  }

  function openEditPlace(place: Place) {
    setEditingPlace(place);
    setPlaceFormOpen(true);
  }

  function openAddMember() {
    setEditingMember(null);
    setMemberFormOpen(true);
  }

  function openEditMember(member: FamilyMember) {
    setEditingMember(member);
    setMemberFormOpen(true);
  }

  async function removePlace(place: Place) {
    const ok = window.confirm(`Remove ${place.name}? If this place is used by events, edit it instead.`);
    if (!ok) return;

    try {
      await deletePlace({ familyId: data.family.id, placeId: place.id });
      await onRefresh?.();
      showToast("Location removed.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function removeMember(member: FamilyMember) {
    const ok = window.confirm(`Remove ${member.display_name} from this family? Their old login will no longer access this family.`);
    if (!ok) return;

    try {
      await deleteMember({ familyId: data.family.id, memberId: member.id });
      await onRefresh?.();
      showToast("Person removed.", "success");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <>
      <div className="fd-grid fd-people-places-panel">
        <div className="fd-segment-row">
          <button className={view === "places" ? "active" : ""} onClick={() => setView("places")}>Locations</button>
          <button className={view === "people" ? "active" : ""} onClick={() => setView("people")}>People</button>
        </div>

        {view === "places" && (
          <PanelCard raised>
            <SectionTitle
              title="Locations"
              subtitle="School, clubs, tutoring and pickup points"
              right={<button onClick={openAddPlace} className="fd-button primary">Add location</button>}
            />

            {data.places.length === 0 ? (
              <EmptyState text="No locations yet." />
            ) : (
              <div className="fd-place-list">
                {data.places.map((place) => (
                  <PlaceCard key={place.id} place={place} onEdit={openEditPlace} onDelete={removePlace} />
                ))}
              </div>
            )}
          </PanelCard>
        )}

        {view === "people" && (
          <PanelCard raised>
            <SectionTitle
              title="People"
              subtitle="Parents, children and homestay students"
              right={<button className="fd-button primary" onClick={openAddMember}>Add person</button>}
            />

            {data.members.length === 0 ? (
              <EmptyState text="No people yet." />
            ) : (
              <div className="fd-person-list">
                {data.members.map((member) => (
                  <PersonCard
                    key={member.id}
                    member={member}
                    currentMemberId={data.role.member_id}
                    onEdit={openEditMember}
                    onDelete={removeMember}
                  />
                ))}
              </div>
            )}

            <div className="fd-muted" style={{ marginTop: 12 }}>
              For children or homestay students, you can add them without login first. Open Edit later and choose “Create login” when they need their own account.
            </div>
          </PanelCard>
        )}
      </div>

      <PlaceFormModal
        open={placeFormOpen}
        data={data}
        place={editingPlace}
        onClose={() => {
          setPlaceFormOpen(false);
          setEditingPlace(null);
        }}
        onSaved={onRefresh}
      />

      <MemberFormModal
        open={memberFormOpen}
        data={data}
        member={editingMember}
        onClose={() => {
          setMemberFormOpen(false);
          setEditingMember(null);
        }}
        onSaved={onRefresh}
      />
    </>
  );
}
