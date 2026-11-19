// Unit tests for the Anywhere-on-Earth application-deadline gate (pure helper).
import { isApplicationDeadlinePassed } from '../deadline';

const at = (iso: string) => new Date(iso);

describe('isApplicationDeadlinePassed (AoE)', () => {
    it('no deadline is never past', () => {
        expect(isApplicationDeadlinePassed(null)).toBe(false);
        expect(isApplicationDeadlinePassed(undefined)).toBe(false);
        expect(isApplicationDeadlinePassed('')).toBe(false);
    });

    it('invalid date is never past (fail open)', () => {
        expect(isApplicationDeadlinePassed('not-a-date')).toBe(false);
    });

    // Deadline = the 22nd. AoE end = next-day 11:59:59.999 UTC (23:59:59.999 @ UTC-12).
    it('is OPEN right up to the AoE boundary', () => {
        const deadline = at('2026-11-22T12:00:00.000Z'); // noon-UTC anchor (new gigs)
        expect(isApplicationDeadlinePassed(deadline, at('2026-11-23T11:59:59.999Z'))).toBe(false);
    });

    it('is CLOSED one millisecond after the AoE boundary', () => {
        const deadline = at('2026-11-22T12:00:00.000Z');
        expect(isApplicationDeadlinePassed(deadline, at('2026-11-23T12:00:00.000Z'))).toBe(true);
    });

    it('legacy midnight-UTC value closes at the same AoE boundary', () => {
        const legacy = at('2026-11-22T00:00:00.000Z'); // old buggy storage
        expect(isApplicationDeadlinePassed(legacy, at('2026-11-23T11:59:59.999Z'))).toBe(false);
        expect(isApplicationDeadlinePassed(legacy, at('2026-11-23T12:00:00.000Z'))).toBe(true);
    });

    it('stays open through the full deadline day in India (IST)', () => {
        const deadline = at('2026-11-22T12:00:00.000Z');
        // 22nd 11:59pm IST = 2026-11-22T18:29:59.999Z — well inside the window.
        expect(isApplicationDeadlinePassed(deadline, at('2026-11-22T18:29:59.999Z'))).toBe(false);
        // Even early on the 23rd IST it is still open (AoE grace) — never cut short.
        expect(isApplicationDeadlinePassed(deadline, at('2026-11-23T05:00:00.000Z'))).toBe(false);
    });

    it('does NOT trip at midnight UTC on the deadline day (the old bug)', () => {
        const deadline = at('2026-11-22T12:00:00.000Z');
        // 05:30 IST on the 22nd — the old `new Date(deadline) < now` closed here.
        expect(isApplicationDeadlinePassed(deadline, at('2026-11-22T00:00:00.000Z'))).toBe(false);
    });
});
