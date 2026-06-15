import { useEffect, useState } from "react";
import type { FamilyData, FamilyMember, FamilyRole } from "../../lib/familyDataTypes";
import { createMember, createMemberLogin, updateMember } from "../../lib/familyDataApi";
import { buttonStyle, fieldStyle, formGridStyle, FormModal, inputStyle, primaryButtonStyle } from "./FormModal";

const loginRoles: FamilyRole[] = ["parent", "guardian", "child", "homestay"];

export function MemberFormModal({
  open,
  data,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  data: FamilyData;
  member?: FamilyMember | null;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
}) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<FamilyRole>("child");
  const [color, setColor] = useState("#31535c");
  const [navigationApp, setNavigationApp] = useState("google");
  const [createLogin, setCreateLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const editing = Boolean(member);
  const canOfferLogin = !member?.can_login;

  useEffect(() => {
    if (!open) return;
    setDisplayName(member?.display_name ?? "");
    setRole((member?.role as FamilyRole | undefined) ?? "child");
    setColor(member?.color ?? "#31535c");
    setNavigationApp(member?.default_navigation_app ?? "google");
    setCreateLogin(false);
    setEmail(member?.email ?? "");
    setPassword("");
    setErrorMessage(null);
  }, [open, member]);

  async function submit() {
    if (!displayName.trim()) return alert("Name is required.");
    if (createLogin) {
      if (!email.trim()) return alert("Email is required for login.");
      if (!password || password.length < 8) return alert("Password must be at least 8 characters.");
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      if (createLogin) {
        await createMemberLogin({
          familyId: data.family.id,
          memberId: member?.id ?? null,
          displayName,
          role,
          email,
          password,
          color,
          defaultNavigationApp: navigationApp,
        });
      } else if (member) {
        await updateMember({
          familyId: data.family.id,
          memberId: member.id,
          displayName,
          role,
          color,
          defaultNavigationApp: navigationApp,
        });
      } else {
        await createMember({
          familyId: data.family.id,
          displayName,
          role,
          color,
          defaultNavigationApp: navigationApp,
        });
      }

      await onSaved?.();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title={editing ? "Edit person" : "Add person"} open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>
          Name
          <input style={inputStyle} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Name shown in the family app" />
        </label>

        <label style={fieldStyle}>
          Role
          <select style={inputStyle} value={role} onChange={(event) => setRole(event.target.value as FamilyRole)}>
            <option value="parent">parent</option>
            <option value="guardian">guardian</option>
            <option value="child">child</option>
            <option value="homestay">homestay</option>
          </select>
        </label>

        <label style={fieldStyle}>
          Colour
          <input style={{ ...inputStyle, height: 44 }} type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>

        <label style={fieldStyle}>
          Navigation app
          <select style={inputStyle} value={navigationApp} onChange={(event) => setNavigationApp(event.target.value)}>
            <option value="google">Google Maps</option>
            <option value="apple">Apple Maps</option>
            <option value="waze">Waze</option>
          </select>
        </label>

        {canOfferLogin && loginRoles.includes(role) && (
          <label style={{ ...fieldStyle, display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={createLogin} onChange={(event) => setCreateLogin(event.target.checked)} />
            Create login for this person
          </label>
        )}

        {createLogin && (
          <>
            <label style={fieldStyle}>
              Login email
              <input style={inputStyle} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="child@example.com" />
            </label>
            <label style={fieldStyle}>
              Temporary password
              <input style={inputStyle} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>
          </>
        )}

        {member?.can_login && <div className="fd-muted">This person already has a Firebase login.</div>}
        {errorMessage && <div className="fd-alert danger">{errorMessage}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </FormModal>
  );
}
