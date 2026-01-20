import { useEffect, useState } from "react";
import { getAuthStatus, getAuthUrl, logout } from "./api";
import type { AuthStatus } from "./api";
import { LoginScreen } from "./components/LoginScreen";
import { Home } from "./components/Home";
import { NewDashboard } from "./components/NewDashboard";
import "./App.css";

type View = "home" | "dashboard";

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    checkAuth();

    // Check for auth callback params
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");
    const authError = params.get("error");

    if (authResult === "success") {
      // Clear URL params and refresh auth status
      window.history.replaceState({}, "", window.location.pathname);
      checkAuth();
    } else if (authError) {
      setError(`Authentication failed: ${authError}`);
      window.history.replaceState({}, "", window.location.pathname);
      setLoading(false);
    }
  }, []);

  async function checkAuth() {
    try {
      setLoading(true);
      const status = await getAuthStatus();
      setAuthStatus(status);
      setError(null);
    } catch (err) {
      setError("Failed to check authentication status. Is the backend running?");
      setAuthStatus({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    try {
      const { url } = await getAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError("Failed to start authentication. Is the backend running?");
    }
  }

  async function handleLogout() {
    try {
      await logout();
      setAuthStatus({ authenticated: false });
      setView("home");
    } catch (err) {
      setError("Failed to logout");
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loader" />
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        error={error}
        onDismissError={() => setError(null)}
      />
    );
  }

  if (view === "dashboard") {
    return (
      <NewDashboard
        user={authStatus.user!}
        onBack={() => setView("home")}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Home
      user={authStatus.user!}
      onViewDashboard={() => setView("dashboard")}
      onLogout={handleLogout}
    />
  );
}

export default App;
