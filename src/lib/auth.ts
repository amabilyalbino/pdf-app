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
