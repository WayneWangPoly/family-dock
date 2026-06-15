import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { LoginPage } from "../../pages/LoginPage";
import { createFamilyAccount } from "../../lib/familyDataApi";

type Props = {
  onLoggedIn: () => void;
};

export function PublicAuthPage({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<"login" | "memberRegister" | "parentSignup">("login");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite")) {
      setMode("memberRegister");
    }
  }, []);

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={{ margin: 0 }}>Family Dock</h1>
            <div style={mutedStyle}>家庭联络坞</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setMode("login")} style={tabStyle(mode === "login")}>Login</button>
            <button onClick={() => setMode("parentSignup")} style={tabStyle(mode === "parentSignup")}>New family</button>
          </div>
        </header>

        {mode === "login" && <LoginPage onLoggedIn={onLoggedIn} />}
        {mode === "memberRegister" && <SelfRegistrationPanel onBack={() => setMode("login")} />}
        {mode === "parentSignup" && <ParentSignupPanel onRegistered={onLoggedIn} />}
      </section>
    </main>
  );
}

function SelfRegistrationPanel({ onBack }: { onBack: () => void }) {
  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Member registration</h2>
      <p style={mutedStyle}>
        Firebase member invitation will be migrated in the next step. For now, create the parent account first, then add children as family members inside the app.
      </p>
      <button onClick={onBack} style={primaryButtonStyle}>Back to login</button>
    </div>
  );
}

function ParentSignupPanel({ onRegistered }: { onRegistered: () => void }) {
  const [familyName, setFamilyName] = useState("");
  const [parentDisplayName, setParentDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stateRegion, setStateRegion] = useState("SA");
  const [schoolLevel, setSchoolLevel] = useState("primary");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit() {
    if (!familyName.trim()) return alert("Family name is required.");
    if (!parentDisplayName.trim()) return alert("Parent display name is required.");
    if (!email.trim()) return alert("Email is required.");
    if (!password || password.length < 8) return alert("Password must be at least 8 characters.");

    setBusy(true);
    setErrorMessage(null);

    try {
      await createFamilyAccount({
        familyName,
        parentDisplayName,
        parentEmail: email,
        parentPassword: password,
        stateRegion,
        schoolLevel,
        timezone: "Australia/Adelaide",
      });
      onRegistered();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Create a new family</h2>
      <label style={labelStyle}>Family name<input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="Chen Family" style={inputStyle} /></label>
      <label style={labelStyle}>Your display name<input value={parentDisplayName} onChange={(event) => setParentDisplayName(event.target.value)} placeholder="Dad / Mum" style={inputStyle} /></label>
      <label style={labelStyle}>Email<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="parent@example.com" style={inputStyle} /></label>
      <label style={labelStyle}>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" style={inputStyle} /></label>
      <label style={labelStyle}>State
        <select value={stateRegion} onChange={(event) => setStateRegion(event.target.value)} style={inputStyle}>
          <option value="SA">SA</option>
          <option value="VIC">VIC</option>
          <option value="NSW">NSW</option>
          <option value="QLD">QLD</option>
          <option value="WA">WA</option>
          <option value="TAS">TAS</option>
          <option value="ACT">ACT</option>
          <option value="NT">NT</option>
        </select>
      </label>
      <label style={labelStyle}>School level
        <select value={schoolLevel} onChange={(event) => setSchoolLevel(event.target.value)} style={inputStyle}>
          <option value="primary">primary</option>
          <option value="secondary">secondary</option>
          <option value="mixed">mixed</option>
        </select>
      </label>
      <button disabled={busy} onClick={submit} style={primaryButtonStyle}>{busy ? "Creating..." : "Create family"}</button>
      {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
    </div>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "9px 11px",
    borderRadius: 12,
    border: "1px solid #d6d3d1",
    fontWeight: 900,
    cursor: "pointer",
    background: active ? "#31535c" : "white",
    color: active ? "white" : "#31535c",
  };
}

const pageStyle: CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 18, background: "#fbf7ef", fontFamily: "system-ui, sans-serif" };
const cardStyle: CSSProperties = { width: "min(820px, 100%)", borderRadius: 28, background: "rgba(255,255,255,.88)", border: "1px solid #eadfd0", padding: 18, boxShadow: "0 18px 60px rgba(120,113,108,.12)" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 };
const panelStyle: CSSProperties = { display: "grid", gap: 12, padding: 12 };
const labelStyle: CSSProperties = { display: "grid", gap: 5, fontSize: 13, fontWeight: 850, color: "#44403c" };
const inputStyle: CSSProperties = { width: "100%", padding: "10px 11px", borderRadius: 12, border: "1px solid #d6d3d1", boxSizing: "border-box", font: "inherit" };
const primaryButtonStyle: CSSProperties = { padding: "11px 12px", borderRadius: 14, border: "1px solid #31535c", background: "#31535c", color: "white", fontWeight: 950, cursor: "pointer" };
const mutedStyle: CSSProperties = { color: "#78716c", fontSize: 13, fontWeight: 700, marginTop: 3 };
const errorStyle: CSSProperties = { padding: 10, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontWeight: 850 };
