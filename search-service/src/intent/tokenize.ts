export function tokenize(input: string): string[] {
  return input
    .split(/[\s.,;:!?()'"-]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

export function isCapitalizedNameToken(rawToken: string): boolean {
  if (!rawToken) return false;
  if (rawToken.length < 3 || rawToken.length > 15) return false;
  return /^[A-Z][a-z]+$/.test(rawToken);
}

export function rawTokens(input: string): string[] {
  return input.split(/[\s.,;:!?()'"-]+/).map(t => t.trim()).filter(Boolean);
}
