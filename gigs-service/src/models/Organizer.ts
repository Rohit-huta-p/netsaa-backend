import mongoose, { Schema } from 'mongoose';

// Read-only mirror of the users-service Organizer doc (shared DB). gigs-service
// only needs to know whether a client is an agency.
const OrganizerSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, index: true },
        organizerTypeCategory: { type: String },
    },
    { collection: 'organizers', strict: false }
);

export default mongoose.models.Organizer || mongoose.model('Organizer', OrganizerSchema);
