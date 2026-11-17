/**
 * Data backfill · 2026-11-17 · Populate gig organizerSnapshot.organizationName
 *
 * Gigs froze organizerSnapshot.organizationName at post time from req.user, which
 * never carried the brand name (it lives on the Organizer doc, not the User/JWT),
 * so every gig stored the "TBD" sentinel. The read path now heals the gig-detail
 * endpoint live, but board cards and org-name search read the STORED snapshot —
 * so they stay "TBD" until this backfill rewrites them.
 *
 * For each gig it resolves the organizer's real brand name from the `organizers`
 * collection and sets organizerSnapshot.organizationName to:
 *     realName || (storedRealName) || ''          (never "TBD")
 *
 * Run:      ts-node src/migrations/2026-11-17-backfill-gig-organization-name.ts [--dry-run]
 * SAFE TO RE-RUN (idempotent — only writes rows whose value actually changes).
 * REQUIRES: GIGS_MONGO_URI (or MONGO_URI) — loaded from .env.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Gig from '../models/Gig';
import Organizer from '../models/Organizer';

dotenv.config();

const MONGO_URI = process.env.GIGS_MONGO_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('✗ GIGS_MONGO_URI (or MONGO_URI) env var required'); process.exit(1); }
const DRY_RUN = process.argv.includes('--dry-run');
const log = (m: string) => console.log(`[backfill-orgname] ${m}`);

/** Same precedence as the getGigById read-heal. Never yields "TBD". */
function desiredName(real: string | undefined, stored: string | undefined): string {
    if (real) return real;
    if (stored && stored !== 'TBD') return stored;
    return '';
}

async function main() {
    log(`Connecting to MongoDB...${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
    await mongoose.connect(MONGO_URI!);
    log('✓ Connected');
    try {
        const gigs: any[] = await Gig.find({})
            .select('organizerId organizerSnapshot.organizationName organizerSnapshot.displayName title')
            .lean();
        log(`Found ${gigs.length} gigs`);

        // Resolve every distinct organizer's real brand name once.
        const organizerIds = [...new Set(gigs.map((g) => String(g.organizerId)).filter(Boolean))];
        const orgs: any[] = await Organizer.find({ userId: { $in: organizerIds } })
            .select('userId organizationName')
            .lean();
        const nameByUser = new Map<string, string>();
        for (const o of orgs) {
            const n = (o.organizationName || '').trim();
            if (n) nameByUser.set(String(o.userId), n);
        }
        log(`Resolved brand names for ${nameByUser.size}/${organizerIds.length} organizers`);

        const ops: any[] = [];
        let unchanged = 0;
        const samples: string[] = [];
        for (const g of gigs) {
            const stored: string | undefined = g.organizerSnapshot?.organizationName;
            const real = nameByUser.get(String(g.organizerId));
            const want = desiredName(real, stored);
            if (want === (stored ?? '')) { unchanged++; continue; }
            ops.push({
                updateOne: {
                    filter: { _id: g._id },
                    update: { $set: { 'organizerSnapshot.organizationName': want } },
                },
            });
            if (samples.length < 12) {
                samples.push(`  · "${g.title}"  ${JSON.stringify(stored ?? null)} → ${JSON.stringify(want)}`);
            }
        }
        log(`To update: ${ops.length} · already-correct: ${unchanged}`);
        if (samples.length) { log('Sample changes:'); samples.forEach((s) => console.log(s)); }

        if (DRY_RUN) {
            log('DRY RUN — no writes performed');
        } else if (ops.length) {
            const res = await Gig.bulkWrite(ops, { ordered: false });
            log(`✓ Updated ${res.modifiedCount} gigs`);
        } else {
            log('Nothing to update');
        }
        log('✓ Backfill complete');
    } catch (err) {
        console.error('✗ Backfill failed:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        log('Disconnected');
    }
}
main();
