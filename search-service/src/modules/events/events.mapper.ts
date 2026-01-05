import { SearchResultItemDTO } from '../search/dto/search-response.dto';

/**
 * Maps a raw MongoDB Event document to the standardized SearchResultItemDTO.
 */
export const mapEventToSearchResult = (doc: any): SearchResultItemDTO => {
    return {
        id: doc._id.toString(),
        type: 'event',
        title: doc.title,
        subtitle: [doc.city, doc.eventType].filter(Boolean).join(' • '), // e.g. "Bangalore • Workshop"
        image: doc.coverImage || doc.organizerProfilePicture,
        score: doc.score,
        metadata: {
            date: doc.startDate,
            price: doc.priceRange || (doc.isFree ? 'Free' : 'Paid'),
            eventType: doc.eventType,
        },
    };
};
