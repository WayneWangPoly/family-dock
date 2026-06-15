import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { buildInviteLink, getInviteStatus, loadFamilyMemberInvites } from "../../lib/inviteStatus";
import type { FamilyMemberInvite } from "../../lib/inviteStatus";
import { getMemberName } from "../../lib/familyUiHelpers";

type Props = { data: FamilyData };

export function InviteStatusDashboard({ data }: Props) {
  const [invites, setInvites] = useState<FamilyMemberInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErrorMessage(null);
    try {
      setInvites(await loadFamilyMemberInvites(data.family.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [data.family.id]);

  return (
    <section style={boxStyle}>
      <header style={headerStyle}>
        <div>
          <h3 style={{ margin: 0 }}>Invite status dashboard</h3>
          <div style={mutedStyle}>查看谁已注册、谁未注册、谁已过期</div>
        </div>
        <button onClick={refresh} style={buttonStyle}>{loading ? "Loading..." : "Refresh"}</button>
      </header>
      {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
      {invites.length === 0 && <div style={mutedStyle}>No invites yet.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {invites.map((invite) => {
          const status = getInviteStatus(invite);
          const link = buildInviteLink(invite.invite_code);
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(link)}`;
          return (
            <div key={invite.id} style={rowStyle}>
              <div style={{ flex: 1 }}>
                <strong>{getMemberName(data, invite.member_id)} · {invite.intended_role}</strong>
                <div style={codeStyle}>{invite.invite_code}</div>
                <div style={mutedStyle}>Status: {status} · Expires: {new Date(invite.expires_at).toLocaleString("en-AU")}</div>
                {invite.used_at && <div style={mutedStyle}>Used: {new Date(invite.used_at).toLocaleString("en-AU")}</div>}
                <input readOnly value={link} style={inputStyle} />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={() => navigator.clipboard.writeText(link)} style={buttonStyle}>Copy link</button>
                  <button onClick={() => navigator.clipboard.writeText(invite.invite_code)} style={buttonStyle}>Copy code</button>
                </div>
              </div>
              <img src={qrUrl} alt={`QR for ${invite.invite_code}`} style={qrStyle} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

const boxStyle: CSSProperties = { padding: 14, borderRadius: 18, background: "#fbf7ef", border: "1px solid #eadfd0", display: "grid", gap: 10 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" };
const rowStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 16, background: "white", flexWrap: "wrap" };
const mutedStyle: CSSProperties = { color: "#78716c", fontSize: 12, fontWeight: 700, marginTop: 3 };
const codeStyle: CSSProperties = { fontWeight: 950, color: "#31535c", letterSpacing: 1.5, marginTop: 4 };
const inputStyle: CSSProperties = { marginTop: 8, width: "100%", padding: "8px 10px", borderRadius: 12, border: "1px solid #d6d3d1", boxSizing: "border-box" };
const buttonStyle: CSSProperties = { padding: "8px 10px", borderRadius: 12, border: "1px solid #d6d3d1", background: "white", color: "#31535c", fontWeight: 900, cursor: "pointer" };
const qrStyle: CSSProperties = { width: 112, height: 112, borderRadius: 12, border: "1px solid #eadfd0", background: "white" };
const errorStyle: CSSProperties = { padding: 9, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontWeight: 800, fontSize: 13 };
