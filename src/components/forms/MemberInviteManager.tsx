import { useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData, FamilyMember } from "../../lib/familyDataTypes";
import { createMemberInvite } from "../../lib/memberSelfRegistration";
type Props = {
  data: FamilyData;
  member: FamilyMember;
};

export function MemberInviteManager({ data, member }: Props) {
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoginReady = Boolean(member.can_login && member.auth_user_id);

  async function generateInvite() {
    setBusy(true);
    setErrorMessage(null);

    try {
      const result = await createMemberInvite({
        familyId: data.family.id,
        memberId: member.id,
        expiresInDays: 14,
      });

      setInviteCode(result.invite.invite_code);
      setExpiresAt(result.invite.expires_at);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={boxStyle}>
      <header style={headerStyle}>
        <div>
          <strong>{member.display_name}</strong>
          <div style={mutedStyle}>
            {member.role} · {isLoginReady ? "login enabled" : "no login yet"}
          </div>
        </div>
        <span style={pillStyle}>{member.role}</span>
      </header>

      <button disabled={busy || isLoginReady} onClick={generateInvite} style={primaryButtonStyle}>
        {busy ? "Generating..." : isLoginReady ? "Already linked" : "Generate invite code"}
      </button>

      {inviteCode && (
        <div style={inviteStyle}>
          <div style={mutedStyle}>Give this code to {member.display_name}:</div>
          <div style={codeStyle}>{inviteCode}</div>
          <div style={mutedStyle}>
            Expires: {expiresAt ? new Date(expiresAt).toLocaleString("en-AU") : "unknown"}
          </div>
        </div>
      )}

      {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
    </div>
  );
}

const boxStyle: CSSProperties = {
  padding: 14,
  borderRadius: 18,
  background: "#fbf7ef",
  border: "1px solid #eadfd0",
  display: "grid",
  gap: 10,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const mutedStyle: CSSProperties = {
  color: "#78716c",
  fontSize: 12,
  fontWeight: 700,
  marginTop: 3,
};

const pillStyle: CSSProperties = {
  padding: "6px 9px",
  borderRadius: 999,
  background: "white",
  border: "1px solid #e7dccb",
  color: "#31535c",
  fontSize: 12,
  fontWeight: 900,
};

const primaryButtonStyle: CSSProperties = {
  padding: "9px 10px",
  borderRadius: 12,
  border: "1px solid #31535c",
  background: "#31535c",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const inviteStyle: CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: "white",
  border: "1px solid #eadfd0",
};

const codeStyle: CSSProperties = {
  fontSize: 24,
  letterSpacing: 2,
  fontWeight: 950,
  color: "#31535c",
  marginTop: 4,
};

const errorStyle: CSSProperties = {
  padding: 9,
  borderRadius: 12,
  background: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 800,
  fontSize: 13,
};
