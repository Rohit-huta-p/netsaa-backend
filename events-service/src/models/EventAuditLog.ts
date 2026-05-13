import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction = 'csv_export' | 'event_cancel' | 'event_reschedule' | 'roster_view';

export interface IEventAuditLog extends Document {
    actorId: mongoose.Types.ObjectId | string;
    action: AuditAction;
    resourceType: 'event';
    resourceId: mongoose.Types.ObjectId | string;
    metadata?: Record<string, any>;
    createdAt: Date;
}

const EventAuditLogSchema = new Schema<IEventAuditLog>({
    actorId: { type: Schema.Types.Mixed, required: true, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true, enum: ['event'] },
    resourceId: { type: Schema.Types.Mixed, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
}, {
    timestamps: { createdAt: true, updatedAt: false },
});

EventAuditLogSchema.index({ actorId: 1, action: 1, createdAt: -1 });
EventAuditLogSchema.index({ resourceId: 1, action: 1, createdAt: -1 });

export default mongoose.model<IEventAuditLog>('EventAuditLog', EventAuditLogSchema);
