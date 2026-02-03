import { SearchResultItemDTO, EventSearchResultDTO } from '../search/dto/search-response.dto';

/**
 * Maps a raw MongoDB Event document to the standardized SearchResultItemDTO.
 */
export const mapEventToSearchResult = (doc: any): EventSearchResultDTO => {
    return {
        id: doc._id.toString(),
        type: 'event',
        title: doc.title,
        subtitle: [doc.location?.city || doc.city, doc.eventType].filter(Boolean).join(' • '),
        image: doc.thumbnailUrl || doc.coverImage || doc.organizerSnapshot?.profileImageUrl,
        score: doc.score,

        // New fields
        coverImage: doc.thumbnailUrl || doc.coverImage,
        ticketPrice: doc.ticketPrice,
        eventType: doc.eventType,
        attendeesCount: doc.maxParticipants,
        rating: doc.organizerSnapshot?.rating || 4.9, // Defaulting as per user request snippet "event.rating || 4.9"
        schedule: doc.schedule,
        location: doc.location,

        metadata: {
            // Keeping metadata for backward compatibility if needed, or we can slim it down
            date: doc.schedule?.startDate,
            price: doc.pricingMode === 'ticketed' ? doc.ticketPrice : 'Free',
        },
    };
};
