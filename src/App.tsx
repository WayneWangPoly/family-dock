import { useEffect, useState } from "react";
import "./styles/fdTheme.css";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "./lib/firebaseClient";
import { PublicAuthPage } from "./components/app/PublicAuthPage";
import { FamilyDockApp } from "./components/app/FamilyDockApp";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { ToastProvider } from "./components/app/ToastProvider";
import { LoadingSkeleton } from "./components/ui/LoadingSkeleton";
import { ensurePwaMetadata } from "./lib/pwaInstall";

export default function App() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    ensurePwaMetadata();

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user: unknown) => {
      setLoggedIn(Boolean(user));
      setChecking(false);
    });

    return unsubscribe;
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        {checking ? (
          <LoadingSkeleton />
        ) : !loggedIn ? (
          <PublicAuthPage onLoggedIn={() => setLoggedIn(true)} />
        ) : (
          <FamilyDockApp />
        )}
      </ToastProvider>
    </ErrorBoundary>
  );
}
