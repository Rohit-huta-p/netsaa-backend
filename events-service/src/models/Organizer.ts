import mongoose, { Schema } from 'mongoose';

// Read-only mirror of the users-service Organizer doc (shared DB). events-service
// reads the brand/organization name for event organizer snapshots. The canonical
// Organizer model (with validation) lives in users-service; this mirror only needs
// to read a couple of fields, so it is intentionally `strict: false`.
const OrganizerSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, index: true },
        organizerTypeCategory: { type: String },
        organizationName: { type: String },
    },
    { collection: 'organizers', strict: false }
);

export default mongoose.models.Organizer || mongoose.model('Organizer', OrganizerSchema);
