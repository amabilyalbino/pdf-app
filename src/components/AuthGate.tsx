import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getFriendlyAuthCallbackMessage,
  getFriendlyAuthErrorMessage,
  isAllowedEmail,
  normalizeEmail
} from "../lib/auth";
import { setStorageScope } from "../lib/storage";
import { allowedEmails, hasProtectedAuthSetup, hasSupabaseEnv, supabase } from "../lib/supabase";
import { isTauriApp } from "../lib/tauri";
import { BrookieConfirmLinkPage, BrookieMagicLinkPage } from "./BrookieMagicLinkPage";

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

function AuthStatusCard({
  eyebrow,
  title,
  body,
  codes
}: {
  eyebrow: string;
  title: string;
  body: string;
  codes?: string[];
}) {
  return (
    <div className="min-h-screen bg-[#F7F1EA] px-4 py-10 text-[#25332D] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center">
        <div className="w-full max-w-2xl rounded-[2rem] bg-white/95 p-8 shadow-[0_36px_90px_rgba(37,51,45,0.12)] ring-1 ring-[#25332D]/6 sm:p-10">
          <span className="inline-flex rounded-full border border-[#25332D]/10 bg-[#F7F1EA] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6A786F]">
            {eyebrow}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.06em] sm:text-5xl">{title}</h1>
          <p className="mt-5 text-lg leading-8 text-[#58655D]">{body}</p>
          {codes?.length ? (
            <div className="mt-8 flex flex-wrap gap-3">
              {codes.map((code) => (
                <code
                  key={code}
                  className="rounded-2xl border border-[#25332D]/10 bg-[#FCFAF7] px-4 py-3 text-sm text-[#4F5D55]"
                >
                  {code}
                </code>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const desktopRuntime = isTauriApp();
  const devBypassActive = import.meta.env.DEV && !hasProtectedAuthSetup;
  const [loading, setLoading] = useState(!desktopRuntime && !devBypassActive);
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isContinuingConfirmation, setIsContinuingConfirmation] = useState(false);

  const hasFullSetup = useMemo(() => hasProtectedAuthSetup, []);
  const confirmationUrl = useMemo(() => {
    if (desktopRuntime) {
      return null;
    }

    const url = new URL(window.location.href);
    return url.searchParams.get("confirmation_url");
  }, [desktopRuntime]);

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
          setAuthError(getFriendlyAuthCallbackMessage(authMessage));
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

  async function handleLogin(email: string) {
    if (!supabase || !hasProtectedAuthSetup) {
      throw new Error("Secure sign-in is not ready yet.");
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error("Enter your approved email to continue.");
    }

    if (!isAllowedEmail(normalizedEmail, allowedEmails)) {
      throw new Error("This email is not approved for this workspace.");
    }

    setAuthError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: new URL(window.location.pathname, window.location.origin).toString(),
        shouldCreateUser: true
      }
    });

    if (error) {
      throw new Error(getFriendlyAuthErrorMessage(error));
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setStorageScope("anonymous");
    setSession(null);
    setAuthError(null);
  }

  function handleContinueConfirmation() {
    if (!confirmationUrl) {
      setAuthError("This sign-in link is missing its confirmation step. Request a fresh email and try again.");
      return;
    }

    try {
      setIsContinuingConfirmation(true);
      const targetUrl = new URL(confirmationUrl);
      window.location.assign(targetUrl.toString());
    } catch {
      setIsContinuingConfirmation(false);
      setAuthError("This sign-in link is no longer valid. Request a fresh email and try again.");
    }
  }

  if (desktopRuntime) {
    return <>{children({ authEmail: null, authProtected: false, authBypassed: true })}</>;
  }

  if (devBypassActive) {
    return <>{children({ authEmail: null, authProtected: false, authBypassed: true })}</>;
  }

  if (!hasSupabaseEnv || !hasFullSetup) {
    return (
      <AuthStatusCard
        eyebrow="Authentication setup"
        title="Secure access is not configured yet."
        body="Add the Supabase keys and the approved email list before sharing this app. Until then, the editor stays locked."
        codes={["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_ALLOWED_EMAILS"]}
      />
    );
  }

  if (loading) {
    return (
      <AuthStatusCard
        eyebrow="Secure access"
        title="Checking your session…"
        body="We are gently opening the door to your PDF workspace."
      />
    );
  }

  if (confirmationUrl) {
    return (
      <BrookieConfirmLinkPage
        recipientName="Brookie"
        isSubmitting={isContinuingConfirmation}
        error={authError}
        onContinue={handleContinueConfirmation}
      />
    );
  }

  if (session?.user?.email) {
    return (
      <>
        {children({
          authEmail: session.user.email,
          authProtected: true,
          authBypassed: false,
          onSignOut: handleSignOut
        })}
      </>
    );
  }

  return (
    <BrookieMagicLinkPage
      recipientName="Brookie"
      externalError={authError}
      onClearExternalError={() => setAuthError(null)}
      onSubmit={handleLogin}
    />
  );
}
