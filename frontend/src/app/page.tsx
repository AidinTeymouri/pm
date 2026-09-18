"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { fetchSession, logout } from "@/lib/auth";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    fetchSession().then((session) =>
      setAuthState(session.authenticated ? "authenticated" : "unauthenticated")
    );
  }, []);

  const handleLogout = async () => {
    await logout();
    setAuthState("unauthenticated");
  };

  const handleSessionExpired = () => {
    setAuthState("unauthenticated");
  };

  if (authState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading...
        </p>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginForm onSuccess={() => setAuthState("authenticated")} />;
  }

  return (
    <KanbanBoard onLogout={handleLogout} onSessionExpired={handleSessionExpired} />
  );
}
