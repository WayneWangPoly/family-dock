import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData, FamilyMember } from "../../lib/familyDataTypes";
import { generateTemporaryPassword, upsertMemberAccount } from "../../lib/memberAccounts";
type Props = {
  data: FamilyData;
  member: FamilyMember;
  onSaved?: () => Promise<unknown> | unknown;
};

export function MemberAccountManager({ data, member, onSaved }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recommendedEmail = useMemo(() => {
    const safeName = member.display_name
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

    return `yourname+${safeName || member.role}@gmail.com`;
  }, [member.display_name, member.role]);

  const isLoginReady = Boolean(member.can_login && member.auth_user_id);

  async function submit() {
    if (!email.trim()) {
      alert("Email is required.");
      return;
    }

    if (!password || password.length < 8) {
      alert("Temporary password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setResultText(null);
    setErrorMessage(null);

    try {
      const result: any = await upsertMemberAccount({
        familyId: data.family.id,
        memberId: member.id,
        email,
        password,
      });

      setResultText(
        `${result.member.display_name} login ${result.account.created ? "created" : "updated"}: ${result.account.email}`,
      );

      await onSaved?.();
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
            {member.role} 路 {isLoginReady ? "login enabled" : "no login yet"}
          </div>
        </div>
        <span style={pillStyle}>{member.role}</span>
      </header>

      <div style={gridStyle}>
        <label style={labelStyle}>
          Login email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={recommendedEmail}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Temporary password
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setPassword(generateTemporaryPassword())}
              style={buttonStyle}
            >
              Generate
            </button>
          </div>
        </label>

        <button disabled={busy} onClick={submit} style={primaryButtonStyle}>
          {busy ? "Saving..." : isLoginReady ? "Update login" : "Create login"}
        </button>
      </div>

      {resultText && <div style={successStyle}>{resultText}</div>}
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
  padding: "9px 10px",
  borderRadius: 12,
  border: "1px solid #d6d3d1",
  boxSizing: "border-box",
  font: "inherit",
};

const buttonStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #d6d3d1",
  background: "white",
  color: "#31535c",
  fontWeight: 900,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#31535c",
  color: "white",
  border: "1px solid #31535c",
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

const successStyle: CSSProperties = {
  padding: 9,
  borderRadius: 12,
  background: "#ecfdf5",
  color: "#047857",
  fontWeight: 800,
  fontSize: 13,
};

const errorStyle: CSSProperties = {
  padding: 9,
  borderRadius: 12,
  background: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 800,
  fontSize: 13,
};
