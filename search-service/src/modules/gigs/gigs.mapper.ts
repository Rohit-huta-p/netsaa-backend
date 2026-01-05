import { SearchResultItemDTO } from '../search/dto/search-response.dto';

/**
 * Maps a raw MongoDB Gig document to the standardized SearchResultItemDTO.
 */
export const mapGigToSearchResult = (doc: any): SearchResultItemDTO => {
    return {
        id: doc._id.toString(),
        type: 'gig',
        title: doc.title, // e.g., "Guitarist needed for Wedding"
        subtitle: [doc.city, doc.artistType].filter(Boolean).join(' • '), // e.g. "Bangalore • Musician"
        image: doc.thumbnail || doc.organizerProfilePicture, // Fallback to organizer pic if no gig thumb
        score: doc.score,
        metadata: {
            compensation: doc.compensation, // e.g. "Paid", "₹5k"
            date: doc.eventDate || doc.date,
            expiresAt: doc.expiresAt,
        },
    };
};
