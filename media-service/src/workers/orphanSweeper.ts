/* ─────────────────────────────────────────────
 *  orphanSweeper.ts  — one-shot CLI (DRY-RUN by default)
 *
 *  Backstop for the event-driven cleanup: finds S3 objects + Mux assets that NO
 *  live document references (uploads abandoned before saving, historical orphans)
 *  and reports them. Deletes NOTHING unless run with `--apply` (or SWEEP_APPLY=1).
 *
 *  Lives in media-service because this is the only service with real AWS creds +
 *  bucket/region + the S3 and Mux clients. The whole backend shares one Mongo DB
 *  (default `test`), so a single connection reads every collection.
 *
 *  Run (from media-service/):
 *    npm run sweep:media           # DRY-RUN — list what it would delete
 *    npm run sweep:media:apply     # ARMED — actually delete (after review!)
 *  Tunables: SWEEP_GRACE_HOURS (default 48 — never touch objects younger than this).
 *
 *  SAFETY: the "referenced set" MUST be complete or live media gets flagged.
 *  Event covers + registration answer photos are uploaded user-scoped (under
 *  users/<uploaderId>/...) but referenced from Event / EventRegistration /
 *  EventReservation docs — all of those are scanned below. Keep this in sync with
 *  every place media URLs/ids are persisted.
 * ───────────────────────────────────────────── */

import mongoose from 'mongoose';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { env, s3Client, s3Config } from '../config';
import { mux } from '../config/mux';
import { MediaAsset } from '../models/MediaAsset';
import { s3KeyFromUrl, deleteS3Objects } from '../utils/s3';

const APPLY = process.argv.includes('--apply') || process.env.SWEEP_APPLY === '1';
const GRACE_MS = Number(process.env.SWEEP_GRACE_HOURS ?? 48) * 3600 * 1000;
const PREFIXES = ['users/', 'events/', 'artists/']; // roots that hold user/event media
const fmtMB = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

interface RefSet {
    keys: Set<string>; // referenced S3 object keys
    uploadIds: Set<string>; // referenced Mux upload ids
    playbackIds: Set<string>; // referenced Mux playback ids
}

/** Scan every collection that can reference media and collect what's live. */
async function buildReferencedSet(db: any): Promise<RefSet> {
    const keys = new Set<string>();
    const uploadIds = new Set<string>();
    const playbackIds = new Set<string>();

    const addUrl = (u: any) => {
        if (typeof u === 'string' && u) {
            const k = s3KeyFromUrl(u);
            if (k) keys.add(k);
        }
    };
    const addUpload = (id: any) => { if (typeof id === 'string' && id) uploadIds.add(id); };
    const addPlayback = (id: any) => { if (typeof id === 'string' && id) playbackIds.add(id); };
    const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

    // users
    for await (const u of db.collection('users').find(
        {},
        { projection: { profileImageUrl: 1, coverImageUrl: 1, galleryUrls: 1, gallery: 1, videoUrls: 1, videoReels: 1, featured: 1 } },
    )) {
        addUrl(u.profileImageUrl);
        addUrl(u.coverImageUrl);
        for (const g of arr(u.galleryUrls)) addUrl(g);
        for (const g of arr(u.gallery)) addUrl(g?.url);
        for (const v of arr(u.videoUrls)) addUrl(v);
        for (const r of arr(u.videoReels)) { addUpload(r?.uploadId); addPlayback(r?.muxPlaybackId); addUrl(r?.thumbnailUrl); }
        for (const f of arr(u.featured)) for (const a of arr(f?.attachments)) { addUrl(a?.url); addUrl(a?.thumbnailUrl); addPlayback(a?.muxPlaybackId); }
    }

    // organizers
    for await (const o of db.collection('organizers').find({}, { projection: { logoUrl: 1, photos: 1 } })) {
        addUrl(o.logoUrl);
        for (const p of arr(o.photos)) addUrl(p);
    }

    // artists
    for await (const a of db.collection('artists').find({}, { projection: { portfolioThumbs: 1 } })) {
        for (const p of arr(a.portfolioThumbs)) addUrl(p);
    }

    // events
    for await (const e of db.collection('events').find(
        {},
        { projection: { thumbnailUrl: 1, media: 1, organizerSnapshot: 1, hostSnapshot: 1, people: 1 } },
    )) {
        addUrl(e.thumbnailUrl);
        for (const m of arr(e.media)) { addUrl(m?.url); addUrl(m?.thumbnailUrl); addUpload(m?.uploadId); addPlayback(m?.muxPlaybackId); }
        addUrl(e.organizerSnapshot?.profileImageUrl);
        addUrl(e.hostSnapshot?.profileImageUrl);
        for (const p of arr(e.people)) addUrl(p?.avatarUrl);
    }

    // eventregistrations — answers[].value is a photo URL for photo questions;
    // application.mediaIds are media-service upload ids.
    for await (const r of db.collection('eventregistrations').find({}, { projection: { answers: 1, application: 1 } })) {
        for (const ans of arr(r.answers)) addUrl(ans?.value);
        for (const mid of arr(r.application?.mediaIds)) addUpload(mid);
        for (const l of arr(r.application?.links)) addUrl(l);
    }

    // eventreservations — the pre-payment copy of photo answers
    for await (const r of db.collection('eventreservations').find({}, { projection: { answers: 1 } })) {
        for (const ans of arr(r.answers)) addUrl(ans?.value);
    }

    return { keys, uploadIds, playbackIds };
}

interface S3Orphan { key: string; size: number; ageH: number; }

async function scanS3(ref: RefSet) {
    const now = Date.now();
    const orphans: S3Orphan[] = [];
    let scanned = 0, referenced = 0, tooRecent = 0;

    for (const prefix of PREFIXES) {
        let token: string | undefined;
        do {
            const out = await s3Client.send(
                new ListObjectsV2Command({ Bucket: s3Config.bucket, Prefix: prefix, ContinuationToken: token }),
            );
            for (const obj of out.Contents ?? []) {
                if (!obj.Key) continue;
                scanned += 1;
                if (ref.keys.has(obj.Key)) { referenced += 1; continue; }
                const age = now - (obj.LastModified?.getTime() ?? now);
                if (age < GRACE_MS) { tooRecent += 1; continue; }
                orphans.push({ key: obj.Key, size: obj.Size ?? 0, ageH: Math.round(age / 3600000) });
            }
            token = out.IsTruncated ? out.NextContinuationToken : undefined;
        } while (token);
    }
    return { orphans, scanned, referenced, tooRecent };
}

interface MuxOrphan { uploadId: string; assetId?: string; status: string; ageH: number; }

async function scanMux(ref: RefSet) {
    const now = Date.now();
    const orphans: MuxOrphan[] = [];
    let scanned = 0, referenced = 0, tooRecent = 0;

    for await (const rec of MediaAsset.find({}, 'uploadId assetId playbackId status createdAt').cursor()) {
        scanned += 1;
        const refd = (rec.uploadId && ref.uploadIds.has(rec.uploadId)) || (rec.playbackId && ref.playbackIds.has(rec.playbackId));
        if (refd) { referenced += 1; continue; }
        const age = now - (rec.createdAt?.getTime?.() ?? now);
        if (age < GRACE_MS) { tooRecent += 1; continue; }
        orphans.push({ uploadId: rec.uploadId, assetId: rec.assetId, status: rec.status, ageH: Math.round(age / 3600000) });
    }
    return { orphans, scanned, referenced, tooRecent };
}

async function run() {
    console.log(`\n======== media orphan sweeper — ${APPLY ? '⚠️  APPLY (will DELETE)' : 'DRY-RUN (no deletes)'} ========`);
    console.log(`   bucket=${s3Config.bucket} region=${s3Config.region} grace=${GRACE_MS / 3600000}h prefixes=[${PREFIXES.join(', ')}]`);

    await mongoose.connect(env.mongoUri);
    const db = mongoose.connection.db;
    if (!db) throw new Error('no Mongo connection');

    const ref = await buildReferencedSet(db);
    console.log(`[sweeper] referenced: ${ref.keys.size} S3 keys · ${ref.uploadIds.size} uploadIds · ${ref.playbackIds.size} playbackIds`);

    const s3 = await scanS3(ref);
    console.log(`\n[S3]  scanned ${s3.scanned} · referenced ${s3.referenced} · too-recent(<grace) ${s3.tooRecent} · ORPHANS ${s3.orphans.length}`);
    for (const o of s3.orphans) console.log(`   orphan  ${o.key}  (${o.size}B, ${o.ageH}h old)`);

    const mx = await scanMux(ref);
    console.log(`\n[Mux] scanned ${mx.scanned} · referenced ${mx.referenced} · too-recent(<grace) ${mx.tooRecent} · ORPHANS ${mx.orphans.length}`);
    for (const o of mx.orphans) console.log(`   orphan  upload=${o.uploadId} asset=${o.assetId ?? '-'} status=${o.status} (${o.ageH}h old)`);

    const reclaimable = s3.orphans.reduce((n, o) => n + o.size, 0);
    console.log(`\n[sweeper] ${APPLY ? 'APPLYING' : 'DRY-RUN'} — ${s3.orphans.length} S3 objects (${fmtMB(reclaimable)}) + ${mx.orphans.length} Mux assets`);

    if (APPLY && (s3.orphans.length || mx.orphans.length)) {
        if (s3.orphans.length) {
            await deleteS3Objects(s3.orphans.map((o) => o.key));
            console.log(`[sweeper] deleted ${s3.orphans.length} S3 objects`);
        }
        let muxDeleted = 0;
        for (const o of mx.orphans) {
            try {
                if (o.assetId) {
                    await mux.video.assets.delete(o.assetId).catch((e: any) => { if (e?.status !== 404) throw e; });
                } else {
                    await mux.video.uploads.cancel(o.uploadId).catch(() => {});
                }
                await MediaAsset.deleteOne({ uploadId: o.uploadId });
                muxDeleted += 1;
            } catch (e: any) {
                console.warn(`[sweeper] mux delete failed for ${o.uploadId}: ${e?.message ?? e}`);
            }
        }
        console.log(`[sweeper] deleted ${muxDeleted} Mux assets`);
    } else if (!APPLY) {
        console.log('[sweeper] (dry-run — nothing deleted; re-run with --apply to delete)');
    }

    await mongoose.disconnect();
    console.log('======== sweep complete ========\n');
    process.exit(0);
}

run().catch((e) => {
    console.error('[sweeper] FATAL:', e);
    process.exit(1);
});
