import { Request, Response } from 'express';
import EventRegistration from '../models/EventRegistration';
import { recordAudit, countActorActionLast24h } from '../services/auditLog.service';

const DAILY_EXPORT_CAP = 5;

function escapeCsv(field: any): string {
    if (field == null) return '';
    const s = String(field);
    if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export async function exportRosterCsv(req: Request, res: Response) {
    try {
        const userId = (req as any).user?.id;
        const event = (req as any).event; // populated by requireOrganizer
        const eventId = req.params.id;

        // Rate limit: 5 exports per organizer per 24h
        const recentCount = await countActorActionLast24h(userId, 'csv_export');
        if (recentCount >= DAILY_EXPORT_CAP) {
            return res.status(429).json({ message: `Daily CSV export limit reached (${DAILY_EXPORT_CAP}/24h)` });
        }

        const rows = await EventRegistration.find({
            eventId,
            status: { $in: ['confirmed', 'attended'] },
        }).sort({ registeredAt: 1 }).lean();

        const dpdpHeader = [
            '# NETSA Roster CSV Export',
            `# Event: ${event?.title || eventId}`,
            `# Exported by: ${userId}`,
            `# At: ${new Date().toISOString()}`,
            '# DPDP NOTICE: Phone numbers are NOT included in roster exports.',
            '# Per India\'s Digital Personal Data Protection Act, full contact',
            '# (phone, email) is shared only at hire-confirmation. Use this',
            '# CSV for headcount and city distribution only.',
            '',
        ].join('\n');

        const csvHead = ['name', 'city', 'status', 'visibility', 'registered_at'].join(',');
        const csvBody = rows.map((r: any) => [
            escapeCsv(r.contactSnapshot?.name ?? ''),
            escapeCsv(r.contactSnapshot?.city ?? ''),
            escapeCsv(r.status),
            escapeCsv(r.visibility),
            escapeCsv(new Date(r.registeredAt).toISOString()),
        ].join(',')).join('\n');

        const body = `${dpdpHeader}${csvHead}\n${csvBody}\n`;

        // Audit log
        await recordAudit({
            actorId: userId,
            action: 'csv_export',
            resourceId: eventId,
            metadata: { rowCount: rows.length },
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="netsa-event-${eventId}-roster.csv"`);
        res.send(body);
    } catch (err) {
        console.error('exportRosterCsv error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}
