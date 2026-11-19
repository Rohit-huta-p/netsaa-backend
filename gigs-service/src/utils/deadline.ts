/**
 * A gig's `applicationDeadline` is a CALENDAR DAY — the hirer picks a day, with no
 * meaningful time-of-day. Applications must stay open through the END of that day
 * for every applicant, wherever they are. The server can't know an applicant's
 * timezone, so it closes the deadline Anywhere-on-Earth (AoE): only once the
 * chosen day is over in UTC-12 (the last timezone on Earth) — i.e. 23:59:59.999
 * at UTC-12, which is 11:59:59.999 UTC the following day.
 *
 * This is the authoritative backstop for the client's own per-viewer gate (which
 * closes at the end of the day in the VIEWER's local timezone). Because the AoE
 * end is the latest any local end-of-day can be, the server never rejects an
 * application the client allowed. The calendar day is read from the stored
 * instant's UTC date, so it is robust to both the noon-UTC anchor used by new
 * gigs and any legacy midnight-UTC value.
 *
 * Mirror of netsa-frontend `src/lib/deadline.ts` (the client closes per-viewer
 * local; this closes AoE).
 */
export function isApplicationDeadlinePassed(
    deadline: Date | string | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!deadline) return false;
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return false;
    // End of the deadline's calendar day, Anywhere-on-Earth:
    //   day 00:00 UTC + 36h - 1ms = next-day 11:59:59.999 UTC = 23:59:59.999 @ UTC-12.
    const aoeEndMs =
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) +
        36 * 60 * 60 * 1000 -
        1;
    return now.getTime() > aoeEndMs;
}
