/**
 * Centralized Ranking Weights Configuration.
 * These values determine the relevance scoring in Atlas Search.
 * Strictly follows the System Design Document.
 */

export const PEOPLE_WEIGHTS = {
    NAME_MATCH: 3.0,
    ARTIST_TYPE_MATCH: 2.0,
    SPECIALITY_MATCH: 2.0, // Treated same as ArtistType usually
    RATING_BOOST: 1.5,     // Multiplier for rating score
    FEATURED_BOOST: 5.0,   // High boost for featured profiles
};

export const GIGS_WEIGHTS = {
    TITLE_MATCH: 3.0,
    ARTIST_TYPE_MATCH: 2.0,
    CITY_MATCH: 1.5,
    FEATURED_BOOST: 5.0, // Urgent/Featured
    URGENT_BOOST: 5.0,
};

export const EVENTS_WEIGHTS = {
    TITLE_MATCH: 3.0,
    EVENT_TYPE_MATCH: 2.0,
    UPCOMING_BOOST: 2.0, // Logic for recent/upcoming events
};
