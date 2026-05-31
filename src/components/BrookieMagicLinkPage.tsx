import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

type BrookieMagicLinkPageProps = {
  defaultEmail?: string;
  recipientName?: string;
  externalError?: string | null;
  onClearExternalError?: () => void;
  onSubmit?: (email: string) => Promise<void>;
};

type MascotMood = "idle" | "attentive" | "typing" | "invalid" | "valid" | "loading" | "success";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function CloudSparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 34 34"
      aria-hidden="true"
      className={cx("h-8 w-8 text-[#F8D65C]", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17 3.5 20.4 13.6 30.5 17l-10.1 3.4L17 30.5l-3.4-10.1L3.5 17l10.1-3.4L17 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FlowerDoodle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 46 46"
      aria-hidden="true"
      className={cx("h-10 w-10 text-[#F29AC2]", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="23" cy="23" r="5.5" fill="#F8D65C" />
      <circle cx="23" cy="8.5" r="7" fill="currentColor" fillOpacity="0.9" />
      <circle cx="37.5" cy="23" r="7" fill="#CDEBFA" fillOpacity="0.95" />
      <circle cx="23" cy="37.5" r="7" fill="#B8E3C8" fillOpacity="0.95" />
      <circle cx="8.5" cy="23" r="7" fill="currentColor" fillOpacity="0.75" />
    </svg>
  );
}

function LittleHeart({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 26"
      aria-hidden="true"
      className={cx("h-6 w-6 text-[#F29AC2]", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.9 22.3 4.4 13.2C1.5 10.5 1.2 5.9 3.8 3.1c2.2-2.4 6-2.7 8.6-.8L14 3.6l1.6-1.3c2.7-1.9 6.4-1.6 8.6.8 2.6 2.8 2.3 7.4-.6 10.1l-9.5 9.1a.3.3 0 0 1-.2 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MascotFace({ mood }: { mood: MascotMood }) {
  if (mood === "invalid") {
    return (
      <>
        <path d="M72 72c5-5 12-7 20-6" stroke="#25332D" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M109 66c8-1 15 1 20 6" stroke="#25332D" strokeWidth="3.5" strokeLinecap="round" />
        <g className="origin-center animate-brookie-blink">
          <circle cx="84" cy="86" r="5.8" fill="#25332D" />
          <circle cx="120" cy="86" r="5.8" fill="#25332D" />
        </g>
        <path
          d="M90 112c6-4 17-4 23 0"
          stroke="#25332D"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  }

  if (mood === "success") {
    return (
      <>
        <path d="M72 72c4-7 11-10 20-10" stroke="#25332D" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M109 62c9 0 16 3 20 10" stroke="#25332D" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M76 86c4 6 10 9 16 9" stroke="#25332D" strokeWidth="4" strokeLinecap="round" />
        <path d="M113 95c6 0 12-3 16-9" stroke="#25332D" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M88 110c6 8 20 8 28 0"
          stroke="#25332D"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  }

  const attentiveShift = mood === "attentive" || mood === "typing" || mood === "loading";
  const happy = mood === "valid";

  return (
    <>
      <path d="M72 72c4-6 11-10 20-10" stroke="#25332D" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M109 62c9 0 16 3 20 10" stroke="#25332D" strokeWidth="3.5" strokeLinecap="round" />
      <g className="origin-center animate-brookie-blink">
        <circle cx={attentiveShift ? 86 : 84} cy={attentiveShift ? 84 : 86} r="5.8" fill="#25332D" />
        <circle cx={attentiveShift ? 118 : 120} cy={attentiveShift ? 84 : 86} r="5.8" fill="#25332D" />
      </g>
      <path
        d={happy ? "M89 108c6 10 19 10 27 0" : "M92 109c5 6 15 6 22 0"}
        stroke="#25332D"
        strokeWidth={happy ? "4.5" : "4"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function BrookieMascot({ mood }: { mood: MascotMood }) {
  const pencilClass =
    mood === "typing"
      ? "animate-brookie-wiggle"
      : mood === "attentive" || mood === "loading"
        ? "translate-y-1 rotate-[4deg]"
        : "";

  const bodyClass =
    mood === "typing"
      ? "animate-brookie-bounce-soft"
      : mood === "loading"
        ? "animate-brookie-pulse-soft"
        : "animate-brookie-float";

  return (
    <div className="relative mx-auto h-56 w-56 sm:h-64 sm:w-64">
      <div className="absolute -left-8 top-6 h-12 w-12 rounded-full bg-[#CDEBFA]/80 blur-[1px] animate-brookie-drift" />
      <div className="absolute -right-4 top-12 h-7 w-7 rounded-full bg-[#F29AC2]/60 animate-brookie-sparkle" />
      <div className="absolute bottom-5 -left-1 h-6 w-6 rounded-full bg-[#F8D65C]/70 animate-brookie-sparkle" />

      {mood === "success" ? (
        <>
          <CloudSparkle className="absolute left-3 top-2 animate-brookie-sparkle" />
          <CloudSparkle className="absolute right-4 top-6 h-6 w-6 text-[#CDEBFA] animate-brookie-sparkle" />
          <LittleHeart className="absolute -right-1 top-20 animate-brookie-drift" />
          <LittleHeart className="absolute left-1 top-24 h-5 w-5 text-[#F8D65C] animate-brookie-sparkle" />
        </>
      ) : null}

      {mood === "valid" ? <CloudSparkle className="absolute right-2 top-8 h-6 w-6 animate-brookie-sparkle" /> : null}
      {mood === "loading" ? <CloudSparkle className="absolute right-2 top-10 h-6 w-6 animate-brookie-pulse-soft" /> : null}

      <svg
        viewBox="0 0 220 220"
        role="presentation"
        aria-hidden="true"
        className={cx("relative z-10 h-full w-full overflow-visible", bodyClass)}
      >
        <defs>
          <linearGradient id="brookieBody" x1="28" y1="38" x2="176" y2="168" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B8E3C8" />
            <stop offset="62%" stopColor="#BEEBCF" />
            <stop offset="100%" stopColor="#CDEBFA" />
          </linearGradient>
          <linearGradient id="brookieArm" x1="32" y1="90" x2="78" y2="130" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B8E3C8" />
            <stop offset="100%" stopColor="#CDEBFA" />
          </linearGradient>
          <linearGradient id="brookiePencil" x1="0" y1="-18" x2="0" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F8D65C" />
            <stop offset="70%" stopColor="#F6C948" />
            <stop offset="70%" stopColor="#74B6FF" />
            <stop offset="85%" stopColor="#74B6FF" />
            <stop offset="85%" stopColor="#F29AC2" />
            <stop offset="100%" stopColor="#F29AC2" />
          </linearGradient>
        </defs>

        <path
          d="M55 56c14-16 39-25 66-23 27 2 51 14 62 34 12 22 13 53 3 78-8 18-25 34-48 41H86c-18-5-35-17-45-33-16-26-17-68 1-97 4-7 8-12 13-16Z"
          fill="url(#brookieBody)"
        />
        <path
          d="M51 94c-16 2-27 14-27 29 0 17 13 31 30 31h14V92l-17 2Z"
          fill="url(#brookieArm)"
        />
        <path
          d="M168 92c17 1 30 14 30 31 0 18-14 31-31 31h-14V94l15-2Z"
          fill="#CDEBFA"
        />
        <path d="M83 178c0 17-9 30-19 30s-19-13-19-30h38Z" fill="#B8E3C8" />
        <path d="M136 178c0 17-9 30-19 30s-19-13-19-30h38Z" fill="#B8E3C8" />

        <MascotFace mood={mood} />

        <g className={cx("origin-[52px_142px] transition-transform duration-300 ease-out", pencilClass)}>
          <path
            d="M44 121c14 8 27 20 35 38"
            stroke="#25332D"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g transform={mood === "attentive" || mood === "typing" ? "translate(4 -6)" : undefined}>
            <rect x="26" y="98" width="24" height="86" rx="12" fill="url(#brookiePencil)" />
            <path d="M26 98 38 74l12 24H26Z" fill="#F3DEC7" />
            <path d="M34 84 38 74l4 10h-8Z" fill="#25332D" />
          </g>
        </g>
        <path
          d="M151 123c-12 8-24 21-31 37"
          stroke="#25332D"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function BrookieMagicLinkPage({
  defaultEmail = "",
  recipientName = "Brookie",
  externalError,
  onClearExternalError,
  onSubmit
}: BrookieMagicLinkPageProps) {
  const inputId = useId();
  const [email, setEmail] = useState(defaultEmail);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasBlurred, setHasBlurred] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    setEmail(defaultEmail);
  }, [defaultEmail]);

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const timer = window.setTimeout(() => setIsTyping(false), 850);
    return () => window.clearTimeout(timer);
  }, [isTyping]);

  const normalizedEmail = email.trim().toLowerCase();
  const hasEmail = normalizedEmail.length > 0;
  const emailLooksValid = EMAIL_PATTERN.test(normalizedEmail);
  const shouldValidate = hasBlurred || hasSubmitted;
  const showInvalid = shouldValidate && hasEmail && !emailLooksValid;
  const showValid = hasEmail && emailLooksValid && !submitError && !externalError && !isSuccess;

  const message = useMemo(() => {
    if (submitError) {
      return { tone: "error" as const, text: submitError };
    }

    if (externalError) {
      return { tone: "error" as const, text: externalError };
    }

    if (showInvalid) {
      return { tone: "error" as const, text: "Oops, that email doesn’t look quite right." };
    }

    if (showValid) {
      return { tone: "success" as const, text: "That looks good." };
    }

    return { tone: "neutral" as const, text: "We’ll send you a little link to open your space." };
  }, [externalError, showInvalid, showValid, submitError]);

  const mascotMood: MascotMood = useMemo(() => {
    if (isSuccess) {
      return "success";
    }
    if (isSubmitting) {
      return "loading";
    }
    if (submitError || externalError || showInvalid) {
      return "invalid";
    }
    if (showValid) {
      return "valid";
    }
    if (isTyping) {
      return "typing";
    }
    if (isFocused) {
      return "attentive";
    }
    return "idle";
  }, [externalError, isFocused, isSubmitting, isSuccess, isTyping, showInvalid, showValid, submitError]);

  async function submitEmail(nextEmail = normalizedEmail) {
    setHasSubmitted(true);

    if (!nextEmail || !EMAIL_PATTERN.test(nextEmail)) {
      setSubmitError(null);
      setIsSuccess(false);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    onClearExternalError?.();

    try {
      if (onSubmit) {
        await onSubmit(nextEmail);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      setIsSuccess(true);
    } catch (error) {
      setIsSuccess(false);
      setSubmitError(error instanceof Error ? error.message : "We couldn’t send your link just now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitEmail();
  }

  async function handleSendAgain() {
    setIsSuccess(false);
    setSubmitError(null);
    await submitEmail();
  }

  function handleEmailChange(nextValue: string) {
    setEmail(nextValue);
    setIsTyping(true);
    setSubmitError(null);
    setIsSuccess(false);
    onClearExternalError?.();
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#F7F1EA] text-[#25332D]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-16 h-56 w-56 rounded-full bg-[#B8E3C8]/45 blur-3xl" />
        <div className="absolute right-[-3.5rem] top-16 h-48 w-48 rounded-full bg-[#CDEBFA]/50 blur-3xl" />
        <div className="absolute bottom-[-3rem] left-1/3 h-40 w-40 rounded-full bg-[#F29AC2]/20 blur-3xl" />
        <div className="absolute bottom-10 right-12 h-32 w-32 rounded-full bg-[#F8D65C]/25 blur-3xl" />
        <CloudSparkle className="absolute left-10 top-16 h-7 w-7 animate-brookie-sparkle text-[#F8D65C]" />
        <LittleHeart className="absolute right-20 top-28 animate-brookie-drift" />
        <FlowerDoodle className="absolute bottom-14 left-12 animate-brookie-drift" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative w-full max-w-5xl pt-28 sm:pt-32">
          <div className="absolute inset-x-0 top-0 z-20 flex justify-center">
            <div className="rounded-[2rem] bg-white/70 px-4 py-3 shadow-[0_16px_40px_rgba(37,51,45,0.08)] ring-1 ring-white/80 backdrop-blur-sm">
              <BrookieMascot mood={mascotMood} />
            </div>
          </div>

          <section className="relative overflow-hidden rounded-[2rem] bg-white/94 px-5 pb-6 pt-28 shadow-[0_36px_90px_rgba(37,51,45,0.12)] ring-1 ring-[#25332D]/6 sm:px-8 sm:pb-8 sm:pt-32 lg:px-12">
            <div className="absolute left-0 top-0 h-24 w-24 rounded-br-[3rem] bg-[#B8E3C8]/18" />
            <div className="absolute bottom-0 right-0 h-24 w-24 rounded-tl-[3rem] bg-[#CDEBFA]/18" />

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] lg:items-start">
              <div className="space-y-6">
                <span className="inline-flex rounded-full border border-[#25332D]/10 bg-[#F7F1EA] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6A786F]">
                  Private workspace
                </span>

                <div className="space-y-4">
                  <h1 className="max-w-[12ch] text-5xl font-semibold leading-[0.94] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
                    {isSuccess ? `Check your inbox, ${recipientName}!` : `Welcome, ${recipientName}!`}
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-[#58655D] sm:text-xl">
                    {isSuccess
                      ? "Your magic link is on its way."
                      : "Hope your day feels as bright and colourful as you are."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-[#25332D]/7 bg-[#FCFAF7] p-4 shadow-[0_14px_30px_rgba(37,51,45,0.05)]">
                    <p className="text-sm font-semibold text-[#25332D]">Gentle access</p>
                    <p className="mt-2 text-sm leading-6 text-[#6B7770]">
                      A magic link opens your private space without a password to remember.
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] border border-[#25332D]/7 bg-[#FCFAF7] p-4 shadow-[0_14px_30px_rgba(37,51,45,0.05)]">
                    <p className="text-sm font-semibold text-[#25332D]">Made for you</p>
                    <p className="mt-2 text-sm leading-6 text-[#6B7770]">
                      Soft colours, tiny sparkles, and a cosy little flow before the real work begins.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[#25332D]/8 bg-[#FFFEFC] p-5 shadow-[0_18px_40px_rgba(37,51,45,0.07)] sm:p-6">
                {!isSuccess ? (
                  <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                    <div className="space-y-2">
                      <label htmlFor={inputId} className="text-sm font-semibold uppercase tracking-[0.2em] text-[#738178]">
                        Email
                      </label>
                      <div
                        className={cx(
                          "group flex items-center rounded-[1.25rem] border bg-white px-4 py-3 shadow-sm transition duration-300",
                          isFocused
                            ? "border-[#7BCB9A] shadow-[0_0_0_6px_rgba(184,227,200,0.35)]"
                            : showInvalid || submitError || externalError
                              ? "border-[#E7B2B7] shadow-[0_0_0_4px_rgba(242,154,194,0.12)]"
                              : showValid
                                ? "border-[#B8E3C8] shadow-[0_0_0_4px_rgba(184,227,200,0.16)]"
                                : "border-[#25332D]/10"
                        )}
                      >
                        <input
                          id={inputId}
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => handleEmailChange(event.target.value)}
                          onFocus={() => {
                            setIsFocused(true);
                            onClearExternalError?.();
                          }}
                          onBlur={() => {
                            setIsFocused(false);
                            setHasBlurred(true);
                          }}
                          placeholder="brookie@studio.com"
                          className="w-full border-none bg-transparent text-lg text-[#25332D] outline-none placeholder:text-[#A8B1AB]"
                          aria-invalid={showInvalid || !!submitError || !!externalError}
                          aria-describedby={`${inputId}-helper`}
                        />
                      </div>
                    </div>

                    <div
                      id={`${inputId}-helper`}
                      aria-live="polite"
                      className={cx(
                        "min-h-6 text-sm leading-6 transition-colors",
                        message.tone === "error"
                          ? "text-[#C7646B]"
                          : message.tone === "success"
                            ? "text-[#5DA37A]"
                            : "text-[#7B877F]"
                      )}
                    >
                      {message.text}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cx(
                        "inline-flex w-full items-center justify-center rounded-[1.2rem] px-5 py-4 text-base font-semibold transition duration-300",
                        isSubmitting
                          ? "cursor-wait bg-[#25332D]/85 text-white shadow-[0_14px_24px_rgba(37,51,45,0.18)]"
                          : "bg-[#25332D] text-white shadow-[0_18px_32px_rgba(37,51,45,0.2)] hover:-translate-y-0.5 hover:bg-[#30413A]"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {isSubmitting ? (
                          <>
                            <span className="flex gap-1">
                              <span className="h-2 w-2 rounded-full bg-white/90 animate-brookie-pulse-soft" />
                              <span className="h-2 w-2 rounded-full bg-white/70 animate-brookie-pulse-soft [animation-delay:180ms]" />
                              <span className="h-2 w-2 rounded-full bg-white/55 animate-brookie-pulse-soft [animation-delay:360ms]" />
                            </span>
                            Sending a little link…
                          </>
                        ) : (
                          "Send my magic link"
                        )}
                      </span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-[1.5rem] border border-[#B8E3C8]/60 bg-[#F7FBF8] p-5">
                      <p className="text-sm uppercase tracking-[0.18em] text-[#7A8C82]">Confirmation</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#25332D]">
                        Check your inbox, {recipientName}!
                      </h2>
                      <p className="mt-3 text-base leading-7 text-[#5F6D65]">Your magic link is on its way.</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendAgain}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#25332D] underline decoration-[#B8E3C8] underline-offset-4 transition hover:text-[#5DA37A]"
                    >
                      {isSubmitting ? "Sending a little link…" : "Send again"}
                    </button>
                  </div>
                )}

                <p className="pt-3 text-center text-sm text-[#8B958F]">Made with a little bit of colour.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
