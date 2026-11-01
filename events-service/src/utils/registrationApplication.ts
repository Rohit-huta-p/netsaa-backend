/**
 * Apply-with-work application payload (gap §6a-d).
 *
 * Pure sanitizer: takes the client's `application` body and returns the object to
 * persist on an apply-door Registration, or undefined when nothing usable was sent.
 * Caps list sizes so a request can't bloat the document. Links/mediaIds are kept as
 * strings (media-service upload ids or external portfolio URLs) — no cross-service
 * ObjectId coupling.
 */

export interface StoredApplication {
  pitch?: string;
  links?: string[];
  mediaIds?: string[];
}

const MAX_LINKS = 10;
const MAX_MEDIA = 20;
const MAX_PITCH = 2000;

const strList = (v: unknown, cap: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, cap);

export function buildApplication(incoming: unknown): StoredApplication | undefined {
  if (!incoming || typeof incoming !== 'object') return undefined;
  const a = incoming as Record<string, unknown>;

  const pitch = typeof a.pitch === 'string' ? a.pitch.trim().slice(0, MAX_PITCH) : '';
  const links = strList(a.links, MAX_LINKS);
  const mediaIds = strList(a.mediaIds, MAX_MEDIA);

  const out: StoredApplication = {};
  if (pitch) out.pitch = pitch;
  if (links.length) out.links = links;
  if (mediaIds.length) out.mediaIds = mediaIds;

  return Object.keys(out).length ? out : undefined;
}
