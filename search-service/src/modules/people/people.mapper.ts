import { SearchResultItemDTO } from '../search/dto/search-response.dto';

/**
 * Maps a raw MongoDB People document to the standardized SearchResultItemDTO.
 */
export const mapPersonToSearchResult = (doc: any): SearchResultItemDTO => {
    return {
        id: doc._id.toString(),
        type: 'people',
        title: doc.displayName || `${doc.firstName} ${doc.lastName}`.trim(),
        subtitle: [doc.artistType, doc.city].filter(Boolean).join(' • '), // e.g. "Dancer • Bangalore"
        image: doc.profilePicture,
        score: doc.score, // Atlas Search meta score
        metadata: {
            username: doc.username,
            rating: doc.rating,
            verified: doc.isVerified,
        },
    };
};
