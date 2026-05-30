import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isAllowedEmail, normalizeEmail } from "../lib/auth";
import { setStorageScope } from "../lib/storage";
import { allowedEmails, hasProtectedAuthSetup, hasSupabaseEnv, supabase } from "../lib/supabase";
import { isTauriApp } from "../lib/tauri";

type AuthGateProps = {
  children: (options: {
    authEmail: string | null;
    authProtected: boolean;
    authBypassed: boolean;
    onSignOut?: () => Promise<void>;
  }) => ReactNode;
};

function removeAuthSearchParams() {
  const url = new URL(window.location.href);
  const authParamKeys = [
    "code",
    "error",
    "error_code",
    "error_description",
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "provider_token",
    "provider_refresh_token",
    "token_type",
    "type"
  ];

  let changed = false;
  authParamKeys.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });

  if (changed) {
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }
}

export function AuthGate({ children }: AuthGateProps) {
  const desktopRuntime = isTauriApp();
  const devBypassActive = import.meta.env.DEV && !hasProtectedAuthSetup;
  const [loading, setLoading] = useState(!desktopRuntime && !devBypassActive);
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const hasFullSetup = useMemo(() => hasProtectedAuthSetup, []);

  useEffect(() => {
    if (desktopRuntime || devBypassActive) {
      setStorageScope("anonymous");
      setLoading(false);
      return;
    }

    if (!supabase || !hasProtectedAuthSetup) {
      setStorageScope("anonymous");
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;

    async function applySession(nextSession: Session | null) {
      const nextEmail = nextSession?.user?.email ? normalizeEmail(nextSession.user.email) : "";

      if (nextSession && !isAllowedEmail(nextEmail, allowedEmails)) {
        setStorageScope("anonymous");
        setSession(null);
        setAuthNotice(null);
        setAuthError("This email is not approved for this workspace.");
        await client.auth.signOut();
        if (active) {
          setLoading(false);
        }
        return;
      }

      setStorageScope(nextEmail || "anonymous");
      if (!active) {
        return;
      }

      setSession(nextSession);
      setLoading(false);
    }

    async function bootstrap() {
      try {
        setLoading(true);

        const url = new URL(window.location.href);
        const authCode = url.searchParams.get("code");
        const authMessage = url.searchParams.get("error_description");

        if (authMessage) {
          removeAuthSearchParams();
          setAuthError(authMessage);
        }

        if (authCode) {
          const { error } = await client.auth.exchangeCodeForSession(authCode);
          removeAuthSearchParams();
          if (error) {
            throw error;
          }
        }

        const {
          data: { session: nextSession }
        } = await client.auth.getSession();

        await applySession(nextSession);
      } catch (error) {
        if (!active) {
          return;
        }

        setStorageScope("anonymous");
        setSession(null);
        setLoading(false);
        setAuthError(error instanceof Error ? error.message : "Could not complete sign-in.");
      }
    }

    void bootstrap();

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [desktopRuntime, devBypassActive]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !hasProtectedAuthSetup) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setAuthError("Enter your approved email to continue.");
      return;
    }

    if (!isAllowedEmail(normalizedEmail, allowedEmails)) {
      setAuthError("This email is not approved for this workspace.");
      return;
    }

    setIsSending(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: new URL(window.location.pathname, window.location.origin).toString(),
          shouldCreateUser: true
        }
      });

      if (error) {
        throw error;
      }

      setAuthNotice(`Check ${normalizedEmail} for the secure sign-in link.`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not send the sign-in link.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setStorageScope("anonymous");
    setSession(null);
    setAuthNotice(null);
    setAuthError(null);
  }

  if (desktopRuntime) {
    return <>{children({ authEmail: null, authProtected: false, authBypassed: true })}</>;
  }

  if (devBypassActive) {
    return <>{children({ authEmail: null, authProtected: false, authBypassed: true })}</>;
  }

  if (!hasSupabaseEnv || !hasFullSetup) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card--setup">
          <p className="eyebrow">Authentication setup required</p>
          <h1>Secure access is not configured yet.</h1>
          <p>
            Add the Supabase keys and the approved email list before sharing this app. Until then, the editor stays
            locked.
          </p>
          <div className="auth-setup-list">
            <code>VITE_SUPABASE_URL</code>
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
            <code>VITE_ALLOWED_EMAILS</code>
          </div>
          <p className="helper-copy">
            Also add your production domain and <code>http://localhost:3000</code> to the Supabase Auth redirect URLs.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card--status">
          <p className="eyebrow">Secure access</p>
          <h1>Checking your session…</h1>
          <p>We are verifying access before loading the PDF workspace.</p>
        </div>
      </div>
    );
  }

  if (session?.user?.email) {
    return <>{children({ authEmail: session.user.email, authProtected: true, authBypassed: false, onSignOut: handleSignOut })}</>;
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Private workspace</p>
        <h1>Sign in to open the PDF editor.</h1>
        <p>Only approved emails can access this workspace. We will send a magic link to your inbox.</p>

        <form className="stack" onSubmit={handleLogin}>
          <label className="form-field">
            <span>Approved email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </label>

          {authError ? <div className="auth-message auth-message--error">{authError}</div> : null}
          {authNotice ? <div className="auth-message auth-message--success">{authNotice}</div> : null}

          <button type="submit" className="button" disabled={isSending}>
            {isSending ? "Sending link..." : "Send secure sign-in link"}
          </button>
        </form>
      </div>
    </div>
  );
}
