import { shouldRevealMeetingLink } from '../meetingLinkReveal';

const startsAt = new Date('2026-04-12T18:00:00Z');
function onlineEvent(revealAt: string) {
  return { location: { type: 'online', meetingLink: 'https://zoom.us/j/1', meetingLinkRevealAt: revealAt }, schedule: { startDate: startsAt } } as any;
}

describe('shouldRevealMeetingLink', () => {
  it('in-person events have no link to reveal', () => {
    expect(shouldRevealMeetingLink({ location: { type: 'physical' } } as any, new Date(), true)).toBe(false);
  });
  it('on_register reveals immediately to a registrant', () => {
    expect(shouldRevealMeetingLink(onlineEvent('on_register'), new Date('2026-04-01T00:00:00Z'), true)).toBe(true);
  });
  it('on_register hides from a non-registrant', () => {
    expect(shouldRevealMeetingLink(onlineEvent('on_register'), new Date('2026-04-01T00:00:00Z'), false)).toBe(false);
  });
  it('T-24h hides 25h before, reveals 23h before', () => {
    expect(shouldRevealMeetingLink(onlineEvent('T-24h'), new Date('2026-04-11T17:00:00Z'), true)).toBe(false);
    expect(shouldRevealMeetingLink(onlineEvent('T-24h'), new Date('2026-04-11T19:00:00Z'), true)).toBe(true);
  });
  it('T-1h reveals 30 min before', () => {
    expect(shouldRevealMeetingLink(onlineEvent('T-1h'), new Date('2026-04-12T17:30:00Z'), true)).toBe(true);
  });
});
