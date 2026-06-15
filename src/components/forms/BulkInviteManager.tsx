import { useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  bulkMemberInvites,
  formatInviteResultsForCopy,
  parseMemberCsv,
} from "../../lib/onboarding";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  data: FamilyData;
  onSaved?: () => Promise<unknown> | unknown;
};

export function BulkInviteManager({ data, onSaved }: Props) {
  const [csvText, setCsvText] = useState("大女儿,child,\n二女儿,child,\nHomestay 1,homestay,\nHomestay 2,homestay,");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function inviteFromCsv() {
    setBusy(true);
    setErrorMessage(null);
    setResults([]);

    try {
      const members: Array<{ display_name: string; role: "child" | "homestay"; email_hint?: string | null }> = parseMemberCsv(csvText);
      const result = await bulkMemberInvites(supabase, {
        familyId: data.family.id,
        members,
        baseUrl: window.location.origin,
        expiresInDays: 14,
      });

      setResults(result.results ?? []);
      await onSaved?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setBusy(false);
    }
  }

  async function inviteAllUnlinked() {
    setBusy(true);
    setErrorMessage(null);
    setResults([]);

    try {
      const result = await bulkMemberInvites(supabase, {
        familyId: data.family.id,
        inviteExistingUnlinked: true,
        baseUrl: window.location.origin,
        expiresInDays: 14,
      });

      setResults(result.results ?? []);
      await onSaved?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    const text = formatInviteResultsForCopy(results);
    await navigator.clipboard.writeText(text);
    alert("Invite links copied.");
  }

  return (
    <section style={boxStyle}>
      <h3 style={{ marginTop: 0 }}>Bulk invite / import</h3>
      <p style={mutedStyle}>
        Paste one member per line: <strong>Name, role, optional email hint</strong>. Role can be child or homestay.
      </p>

      <textarea
        value={csvText}
        onChange={(event) => setCsvText(event.target.value)}
        style={textareaStyle}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={inviteFromCsv} style={primaryButtonStyle}>
          {busy ? "Working..." : "Import + invite"}
        </button>
        <button disabled={busy} onClick={inviteAllUnlinked} style={buttonStyle}>
          Invite all unlinked
        </button>
        {results.length > 0 && (
          <button onClick={copyAll} style={buttonStyle}>Copy all links</button>
        )}
      </div>

      {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

      {results.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {results.map((item) => (
            <div key={item.invite.id} style={resultStyle}>
              <strong>{item.member.display_name} · {item.member.role}</strong>
              <div style={codeStyle}>{item.invite.invite_code}</div>
              <input readOnly value={item.invite.registration_link} style={inputStyle} />
              <button
                onClick={() => navigator.clipboard.writeText(item.invite.registration_link)}
                style={buttonStyle}
              >
                Copy link
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
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

const mutedStyle: CSSProperties = {
  color: "#78716c",
  fontSize: 13,
  fontWeight: 700,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 110,
  borderRadius: 14,
  border: "1px solid #d6d3d1",
  padding: 10,
  boxSizing: "border-box",
  font: "inherit",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #d6d3d1",
  boxSizing: "border-box",
};

const buttonStyle: CSSProperties = {
  padding: "9px 10px",
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

const resultStyle: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "white",
  display: "grid",
  gap: 7,
};

const codeStyle: CSSProperties = {
  fontWeight: 950,
  letterSpacing: 2,
  color: "#31535c",
};

const errorStyle: CSSProperties = {
  padding: 9,
  borderRadius: 12,
  background: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 800,
  fontSize: 13,
};
