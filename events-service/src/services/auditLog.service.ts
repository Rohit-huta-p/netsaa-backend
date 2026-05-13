import EventAuditLog, { AuditAction } from '../models/EventAuditLog';

export async function recordAudit(params: {
    actorId: string;
    action: AuditAction;
    resourceId: string;
    metadata?: Record<string, any>;
}): Promise<void> {
    try {
        await EventAuditLog.create({
            actorId: params.actorId,
            action: params.action,
            resourceType: 'event',
            resourceId: params.resourceId,
            metadata: params.metadata,
        });
    } catch (err) {
        console.error('audit log write failed:', err);
        // Best-effort. Don't fail the parent operation.
    }
}

export async function countActorActionLast24h(actorId: string, action: AuditAction): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return EventAuditLog.countDocuments({
        actorId,
        action,
        createdAt: { $gte: cutoff },
    });
}
