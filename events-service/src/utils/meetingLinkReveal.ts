const OFFSETS_MS: Record<string, number> = {
  'T-24h': 24 * 60 * 60 * 1000,
  'T-1h': 60 * 60 * 1000,
};

/** Should the online join link be visible to this viewer right now? */
export function shouldRevealMeetingLink(event: any, now: Date, isRegistered: boolean): boolean {
  const loc = event.location || {};
  if (loc.type !== 'online' && loc.type !== 'hybrid') return false;
  if (!loc.meetingLink) return false;
  if (!isRegistered) return false; // only registrants ever see the link

  const revealAt = loc.meetingLinkRevealAt || 'T-24h';
  if (revealAt === 'on_register') return true;

  const startsAt = new Date(event.schedule?.startDate).getTime();
  const threshold = startsAt - (OFFSETS_MS[revealAt] ?? OFFSETS_MS['T-24h']);
  return now.getTime() >= threshold;
}
