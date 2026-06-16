import { useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData, FamilyMember } from "../../lib/familyDataTypes";
import { runMemberAccountAction } from "../../lib/accountActions";
type Props = { data: FamilyData; member: FamilyMember; onSaved?: () => Promise<unknown> | unknown };

export function AccountSecurityManager({ data, member, onSaved }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasAccount = Boolean(member.auth_user_id);

  async function run(action: "reset_password" | "disable" | "enable") {
    if (action === "reset_password" && newPassword.length < 8) return alert("Password must be at least 8 characters.");
    if (action === "disable" && !window.confirm(`Disable login for ${member.display_name}?`)) return;
    setBusy(action);
    setMessage(null);
    setErrorMessage(null);
    try {
      await runMemberAccountAction({ familyId: data.family.id, memberId: member.id, action, newPassword: action === "reset_password" ? newPassword : undefined });
      setMessage(`${member.display_name}: ${action} done.`);
      setNewPassword("");
      await onSaved?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={boxStyle}>
      <header style={headerStyle}>
        <div>
          <strong>{member.display_name}</strong>
          <div style={mutedStyle}>{member.role} · {hasAccount ? "has account" : "no account"} · login {String(member.can_login)}</div>
        </div>
      </header>
      {hasAccount ? <>
        <label style={labelStyle}>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} placeholder="At least 8 characters" /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={Boolean(busy)} onClick={() => run("reset_password")} style={buttonStyle}>{busy === "reset_password" ? "Resetting..." : "Reset password"}</button>
          {member.can_login
            ? <button disabled={Boolean(busy)} onClick={() => run("disable")} style={buttonStyle}>{busy === "disable" ? "Disabling..." : "Disable"}</button>
            : <button disabled={Boolean(busy)} onClick={() => run("enable")} style={buttonStyle}>{busy === "enable" ? "Enabling..." : "Enable"}</button>}
        </div>
      </> : <div style={mutedStyle}>Create account or invite this member first.</div>}
      {message && <div style={successStyle}>{message}</div>}
      {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
    </div>
  );
}

const boxStyle: CSSProperties = { padding: 14, borderRadius: 18, background: "#fbf7ef", border: "1px solid #eadfd0", display: "grid", gap: 10 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const mutedStyle: CSSProperties = { color: "#78716c", fontSize: 12, fontWeight: 700, marginTop: 3 };
const labelStyle: CSSProperties = { display: "grid", gap: 5, fontSize: 13, fontWeight: 850, color: "#44403c" };
const inputStyle: CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 12, border: "1px solid #d6d3d1", boxSizing: "border-box", font: "inherit" };
const buttonStyle: CSSProperties = { padding: "8px 10px", borderRadius: 12, border: "1px solid #d6d3d1", background: "white", color: "#31535c", fontWeight: 900, cursor: "pointer" };
const successStyle: CSSProperties = { padding: 9, borderRadius: 12, background: "#ecfdf5", color: "#047857", fontWeight: 800, fontSize: 13 };
const errorStyle: CSSProperties = { padding: 9, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontWeight: 800, fontSize: 13 };
