import Event from '../models/Event';

export interface DriftResult {
    driftCount: number;
    totalEvents: number;
    alertWorthy: boolean;
    fixed: { eventId: string; stored: number; computed: number }[];
}

/**
 * Detect and auto-fix capacity.registeredCount drift via single aggregate
 * pipeline. Joins Event ↔ EventRegistration via $lookup, computes truth-count,
 * filters where stored != computed.
 *
 * Performance: one query for drifts + one for total. ~50-100ms even at 10k events.
 * (Beats the per-event countDocuments loop which was 10k+ queries.)
 */
export async function detectAndFixDrift(): Promise<DriftResult> {
    const driftRows = await Event.aggregate([
        { $match: { status: { $in: ['live', 'completed'] } } },
        {
            $lookup: {
                from: 'eventregistrations',
                let: { eid: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ['$eventId', '$$eid'] },
                            status: 'confirmed',
                        },
                    },
                    { $count: 'count' },
                ],
                as: 'registrations',
            },
        },
        {
            $project: {
                stored: '$capacity.registeredCount',
                computed: {
                    $ifNull: [{ $arrayElemAt: ['$registrations.count', 0] }, 0],
                },
            },
        },
        { $match: { $expr: { $ne: ['$stored', '$computed'] } } },
    ]);

    const totalRows = await Event.aggregate([
        { $match: { status: { $in: ['live', 'completed'] } } },
        { $count: 'count' },
    ]);
    const totalEvents = totalRows[0]?.count || 0;

    const fixed: DriftResult['fixed'] = [];
    for (const row of driftRows) {
        await Event.findByIdAndUpdate(row._id, {
            'capacity.registeredCount': row.computed,
        });
        fixed.push({ eventId: row._id, stored: row.stored, computed: row.computed });
        console.warn('capacity_drift_detected', {
            eventId: row._id,
            stored: row.stored,
            computed: row.computed,
        });
    }

    const alertWorthy = totalEvents > 0 && (driftRows.length / totalEvents) > 0.01;

    return {
        driftCount: driftRows.length,
        totalEvents,
        alertWorthy,
        fixed,
    };
}
