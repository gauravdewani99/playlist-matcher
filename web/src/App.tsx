import { useEffect, useState } from "react";
import { getAuthStatus, getAuthUrl, logout } from "./api";
import type { AuthStatus } from "./api";
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

  // Show dashboard if authenticated and on dashboard view
  if (authStatus?.authenticated && view === "dashboard") {
    return (
      <NewDashboard
        user={authStatus.user!}
        onBack={() => setView("home")}
        onLogout={handleLogout}
      />
    );
  }

  // Show Home for both logged in and logged out users
  return (
    <>
      {error && (
        <div className="app-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-dismiss">&times;</button>
        </div>
      )}
      <Home
        user={authStatus?.authenticated ? authStatus.user! : null}
        onViewDashboard={() => setView("dashboard")}
        onLogout={handleLogout}
        onLogin={handleLogin}
      />
    </>
  );
}

export default App;
