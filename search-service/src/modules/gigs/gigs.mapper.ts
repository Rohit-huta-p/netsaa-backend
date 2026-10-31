import { SearchResultItemDTO } from '../search/dto/search-response.dto';

/**
 * Maps a raw MongoDB Gig document to the standardized SearchResultItemDTO.
 */
export const mapGigToSearchResult = (doc: any): SearchResultItemDTO => {
    return {
        id: doc._id.toString(),
        type: 'gig',
        title: doc.title, // e.g., "Guitarist needed for Wedding"
        // Gig stores city at location.city and crafts in artistTypes[] — the old
        // top-level doc.city / doc.artistType were always undefined → blank subtitle.
        subtitle: [doc.location?.city || doc.city, doc.artistTypes?.[0] || doc.artistType].filter(Boolean).join(' • '), // e.g. "Pune • Dancer"
        image: doc.thumbnail || doc.organizerProfilePicture, // Fallback to organizer pic if no gig thumb
        score: doc.score,
        metadata: {
            compensation: doc.compensation, // e.g. "Paid", "₹5k"
            date: doc.eventDate || doc.date,
            expiresAt: doc.expiresAt,
        },
        raw: {
            ...doc,
            // Ensure ID is string
            _id: doc._id.toString(),
            id: doc._id.toString(),
        },
    };
};
