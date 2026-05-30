export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAllowedEmails(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((value) => normalizeEmail(value))
        .filter(Boolean)
    )
  );
}

export function isAllowedEmail(email: string, allowedEmails: string[]): boolean {
  if (allowedEmails.length === 0) {
    return false;
  }

  return allowedEmails.includes(normalizeEmail(email));
}

export function isRateLimitAuthErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  return normalizedMessage.includes("rate limit");
}

export function getFriendlyAuthErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "").trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (!normalizedMessage) {
    return "Could not send the sign-in link.";
  }

  if (normalizedMessage.includes("email rate limit exceeded")) {
    return "Too many sign-in emails were requested. Supabase's default email service is heavily rate-limited, so wait a few minutes before trying again or switch this project to a custom SMTP provider.";
  }

  if (normalizedMessage.includes("rate limit")) {
    return "A sign-in link was requested too recently. Wait about a minute, then try again with the latest email in your inbox.";
  }

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("networkerror")) {
    return "Could not reach the sign-in service. Check your connection and try again.";
  }

  return rawMessage;
}
