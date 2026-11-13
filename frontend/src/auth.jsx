// frontend/src/auth.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { BrandMark, Wordmark } from "./components/ui";

// Same fallback as your other files. On Vercel, VITE_API_URL is your Render URL.
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const STORAGE_KEY = "voxora_session";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession); // { token, user } | null
  const [error, setError] = useState("");

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    setError("");
    try {
      const res = await fetch(`${API}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Sign-in failed");
      const data = await res.json();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSession(data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // fetch wrapper that adds the token and signs the user out on 401
  const apiFetch = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${session?.token}`,
        },
      });
      if (res.status === 401) logout();
      return res;
    },
    [session, logout]
  );

  // for WebSockets and <audio src>, which cannot send headers
  const withToken = useCallback(
    (url) => `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(session?.token || "")}`,
    [session]
  );

  // clear any "expired" state when the session changes
  useEffect(() => setError(""), [session]);

  const value = useMemo(
    () => ({ user: session?.user, token: session?.token, apiFetch, withToken, logout, loginWithGoogle, error }),
    [session, apiFetch, withToken, logout, loginWithGoogle, error]
  );

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </GoogleOAuthProvider>
  );
}

/* ───────────────────────── Login screen ───────────────────────── */

const POINTS = [
  ["Live AI voice calls", "Talk to customers in English and Hinglish, with a live transcript."],
  ["Instant call summaries", "Sales status, requirements, objections and next steps when the call ends."],
  ["Human-approved follow-ups", "Every follow-up email is reviewed by an administrator before it is sent."],
];

// Wrap <App /> content with this: shows the login screen until the user signs in.
export function LoginGate({ children }) {
  const { user, loginWithGoogle, error } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);

  if (user) return children;

  const onSuccess = async (r) => {
    setGoogleFailed(false);
    setSigningIn(true);
    try {
      await loginWithGoogle(r.credential);
    } finally {
      setSigningIn(false);
    }
  };

  const message = error || (googleFailed ? "Google sign-in didn't finish. Try again." : "");

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 15% 0%, rgb(124 58 237 / 0.45), transparent 70%), radial-gradient(50% 45% at 100% 100%, rgb(6 182 212 / 0.28), transparent 70%)",
          }}
        />

        <div className="group/brand relative flex items-center gap-3">
          <BrandMark animate="hover" />
          <Wordmark className="text-[1.4rem]" onDark />
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight">
            Sales conversations,
            <br />
            <span className="text-gradient-light">handled end to end.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(([title, text]) => (
              <li key={title} className="flex gap-3.5">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-violet-400" />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-500">© {new Date().getFullYear()} Voxora AI</p>
      </aside>

      {/* Sign-in */}
      <main className="animate-reveal grid place-items-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="group/brand mb-10 flex items-center gap-3 lg:hidden">
            <BrandMark animate="always" />
            <Wordmark className="text-[1.4rem]" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Sign in to Voxora AI</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Your calls, summaries and recordings are private to your Google account.
          </p>

          <div
            className={`mt-8 flex min-h-11 transition-opacity duration-300 ${
              signingIn ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <GoogleLogin
              onSuccess={onSuccess}
              onError={() => setGoogleFailed(true)}
              text="continue_with"
              shape="rectangular"
              size="large"
              theme="outline"
              width="320"
            />
          </div>

          <div aria-live="polite" className="mt-4 min-h-5 text-sm">
            {signingIn ? (
              <span className="text-zinc-600">Signing you in…</span>
            ) : message ? (
              <span role="alert" className="text-red-700">
                {message}
              </span>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
