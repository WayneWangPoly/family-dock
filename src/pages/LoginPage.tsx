import { useState } from "react";
import type { FormEvent } from "react";
import { signInWithEmailPassword } from "../lib/familyDataApi";

type LoginPageProps = {
  onLoggedIn: () => void;
};

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);

    try {
      await signInWithEmailPassword(email, password);
      onLoggedIn();
    } catch (error) {
      let message = "Login failed. Please check your email and password.";

      if (error instanceof Error && error.message) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        message = JSON.stringify(error);
      } else if (error) {
        message = String(error);
      }

      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fd-auth-inner">
      <h2>Welcome back</h2>
      <p className="fd-auth-copy">Sign in with your family account.</p>

      <form onSubmit={handleSubmit} className="fd-auth-form">
        <label className="fd-field">
          Email
          <input
            className="fd-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label className="fd-field">
          Password
          <input
            className="fd-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {errorMessage && <div className="fd-alert danger">{errorMessage}</div>}

        <button type="submit" disabled={busy} className="fd-button primary">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
