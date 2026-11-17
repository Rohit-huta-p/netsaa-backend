import mongoose, { Schema } from 'mongoose';

// Read-only mirror of the users-service Organizer doc (shared DB). gigs-service
// reads the agency category and the brand/organization name for gig snapshots.
const OrganizerSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, index: true },
        organizerTypeCategory: { type: String },
        organizationName: { type: String },
    },
    { collection: 'organizers', strict: false }
);

export default mongoose.models.Organizer || mongoose.model('Organizer', OrganizerSchema);
