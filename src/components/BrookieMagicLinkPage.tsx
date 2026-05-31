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

function TinyEnvelope({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 24"
      aria-hidden="true"
      className={cx("h-6 w-6 text-[#25332D]", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="4" width="26" height="18" rx="5" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 8.5 15 14.5l9.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx("h-5 w-5 text-[#97A39D]", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 8.5 12 12.5l5.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
    <div className="relative mx-auto h-60 w-60 sm:h-[17rem] sm:w-[17rem] md:h-[18.5rem] md:w-[18.5rem]">
      <div className="absolute -left-6 top-8 h-12 w-12 rounded-full bg-[#CDEBFA]/80 blur-[1px] animate-brookie-drift" />
      <div className="absolute -right-2 top-14 h-7 w-7 rounded-full bg-[#F29AC2]/60 animate-brookie-sparkle" />
      <div className="absolute bottom-6 left-2 h-6 w-6 rounded-full bg-[#F8D65C]/70 animate-brookie-sparkle" />
      <div className="absolute right-8 top-3 rounded-full bg-white/90 px-2.5 py-2 shadow-[0_10px_20px_rgba(37,51,45,0.08)] ring-1 ring-[#25332D]/5">
        <TinyEnvelope className={mood === "typing" ? "animate-brookie-wiggle" : ""} />
      </div>

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
        <div className="absolute left-[-2rem] top-12 h-44 w-44 rounded-full bg-[#B8E3C8]/28 blur-3xl" />
        <div className="absolute right-[-1.5rem] top-28 h-36 w-36 rounded-full bg-[#CDEBFA]/38 blur-3xl" />
        <div className="absolute bottom-12 left-[-1rem] h-28 w-28 rounded-full bg-[#F29AC2]/14 blur-3xl" />
        <div className="absolute bottom-14 right-4 h-24 w-24 rounded-full bg-[#F8D65C]/18 blur-3xl" />
        <CloudSparkle className="absolute left-10 top-[4.25rem] h-6 w-6 animate-brookie-sparkle text-[#F8D65C]" />
        <CloudSparkle className="absolute right-14 top-[10.5rem] h-4 w-4 animate-brookie-sparkle text-[#CDEBFA]" />
        <LittleHeart className="absolute right-10 top-[5.5rem] h-5 w-5 animate-brookie-drift" />
        <LittleHeart className="absolute left-14 top-[18rem] h-4 w-4 text-[#F8D65C] animate-brookie-sparkle" />
        <FlowerDoodle className="absolute bottom-[6rem] left-10 h-8 w-8 animate-brookie-drift" />
        <div className="absolute left-12 top-1/3 h-2.5 w-2.5 rounded-full bg-[#CDEBFA]" />
        <div className="absolute right-12 bottom-1/4 h-3 w-3 rounded-full bg-[#F29AC2]/70" />
        <div className="absolute right-[18%] top-[42%] h-2 w-2 rounded-full bg-[#F8D65C]/80" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[560px] items-center justify-center px-4 py-6 sm:px-6">
        <div className="relative w-full sm:-translate-y-6 md:-translate-y-10">
          <div className="mb-5 text-center sm:mb-6">
            <h1 className="mx-auto max-w-[9ch] text-[3.2rem] font-semibold leading-[0.96] tracking-[-0.072em] sm:text-[3.6rem] md:text-[4rem]">
              {isSuccess ? `Check your inbox, ${recipientName}!` : `Welcome, ${recipientName}!`}
            </h1>
            <p className="mx-auto mt-2.5 max-w-[26ch] text-[1rem] leading-7 text-[#6D7670] sm:text-[1.06rem] md:text-[1.08rem]">
              {isSuccess ? "Your magic link is on its way." : "Hope your day feels as bright and colourful as you are."}
            </p>
          </div>

          <div className="relative z-20 mb-[-4.4rem] flex justify-center sm:mb-[-4.9rem] md:mb-[-5.3rem]">
            <div className="relative">
              <div className="absolute inset-x-0 bottom-4 mx-auto h-[4.5rem] w-[8.5rem] rounded-full bg-[#B8E3C8]/22 blur-2xl md:h-[5rem] md:w-[9.25rem]" />
              <BrookieMascot mood={mascotMood} />
            </div>
          </div>

          <section className="relative mx-auto w-full max-w-[468px] overflow-hidden rounded-[2.35rem] border border-[#25332D]/6 bg-white px-7 pb-8 pt-28 shadow-[0_22px_54px_rgba(37,51,45,0.082)] sm:px-8 sm:pb-9 sm:pt-[7.5rem] md:px-9 md:pb-10 md:pt-[7.85rem]">
            <div className="absolute inset-x-0 top-0 h-[5.5rem] bg-linear-to-b from-[#B8E3C8]/12 to-transparent" />
            <div className="absolute left-5 top-[4.5rem] h-3 w-3 rounded-full bg-[#F8D65C]/75" />
            <div className="absolute right-5 top-[4.5rem] h-2.5 w-2.5 rounded-full bg-[#CDEBFA]" />
            <div className="absolute right-9 top-12 h-2 w-2 rounded-full bg-[#F29AC2]/70" />
            <div className="absolute left-7 top-[6.3rem] h-1.5 w-1.5 rounded-full bg-[#B8E3C8]/90" />
            {showValid ? <CloudSparkle className="absolute right-7 top-24 h-5 w-5 animate-brookie-sparkle text-[#F8D65C]" /> : null}

            {!isSuccess ? (
              <form className="space-y-5 md:space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <label htmlFor={inputId} className="text-sm font-semibold text-[#25332D]">
                    Email
                  </label>
                  <div
                    className={cx(
                      "group flex items-center gap-3 rounded-[1.4rem] border bg-white px-4 py-[1.15rem] shadow-[0_10px_28px_rgba(37,51,45,0.04)] transition duration-300 md:px-[1.15rem]",
                      isFocused
                        ? "border-[#A8DDBA] shadow-[0_0_0_6px_rgba(184,227,200,0.35)]"
                        : showInvalid || submitError || externalError
                          ? "border-[#E7B2B7] shadow-[0_0_0_4px_rgba(242,154,194,0.12)]"
                          : showValid
                            ? "border-[#B8E3C8] shadow-[0_0_0_4px_rgba(184,227,200,0.16)]"
                            : "border-[#25332D]/10"
                    )}
                  >
                    <EmailIcon className={showValid ? "text-[#7CB98F]" : isFocused ? "text-[#86C59A]" : undefined} />
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
                      className="w-full border-none bg-transparent text-[1.04rem] text-[#25332D] outline-none placeholder:text-[#A7AEA9] md:text-[1.08rem]"
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
                        : "text-[#6D7670]"
                  )}
                >
                  {message.text}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cx(
                    "inline-flex w-full items-center justify-center rounded-[1.4rem] px-5 py-[1.125rem] text-base font-semibold text-[#25332D] transition duration-300 md:py-[1.18rem]",
                    isSubmitting
                      ? "cursor-wait bg-[#B8E3C8]/80 shadow-[0_14px_24px_rgba(168,221,186,0.35)]"
                      : "bg-[#A8DDBA] shadow-[0_14px_28px_rgba(168,221,186,0.38)] hover:-translate-y-0.5 hover:bg-[#B5E4C4] hover:shadow-[0_18px_32px_rgba(168,221,186,0.42)]"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isSubmitting ? (
                      <>
                        <span className="flex gap-1">
                          <span className="h-2 w-2 rounded-full bg-[#25332D]/85 animate-brookie-pulse-soft" />
                          <span className="h-2 w-2 rounded-full bg-[#25332D]/65 animate-brookie-pulse-soft [animation-delay:180ms]" />
                          <span className="h-2 w-2 rounded-full bg-[#25332D]/45 animate-brookie-pulse-soft [animation-delay:360ms]" />
                        </span>
                        Sending a little link…
                      </>
                    ) : (
                      "Send my magic link"
                    )}
                  </span>
                </button>

                <div className="pt-2 text-center">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <CloudSparkle className="h-3.5 w-3.5 text-[#F8D65C]/90" />
                    <LittleHeart className="h-4 w-4 text-[#F29AC2]/80" />
                  </div>
                  <p className="text-xs text-[#93A099] sm:text-[0.82rem]">Made with a little bit of colour.</p>
                </div>
              </form>
            ) : (
              <div className="space-y-5 text-center">
                <p className="mx-auto max-w-[25ch] text-base leading-7 text-[#6D7670]">Your magic link is on its way.</p>

                <button
                  type="button"
                  onClick={handleSendAgain}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#25332D] underline decoration-[#B8E3C8] underline-offset-4 transition hover:text-[#5DA37A]"
                >
                  {isSubmitting ? "Sending a little link…" : "Send again"}
                </button>

                <div className="pt-2 text-center">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <CloudSparkle className="h-3.5 w-3.5 text-[#F8D65C]/90" />
                    <LittleHeart className="h-4 w-4 text-[#F29AC2]/80" />
                  </div>
                  <p className="text-xs text-[#93A099] sm:text-[0.82rem]">Made with a little bit of colour.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
