// frontend/src/main.jsx
import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider, LoginGate } from "./auth.jsx";

// Catches unexpected render errors so users see a recovery screen, not a blank page.
class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Voxora AI crashed:", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Voxora AI hit an unexpected error. Reload the page to continue.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mt-6"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <LoginGate>
          <App />
        </LoginGate>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);