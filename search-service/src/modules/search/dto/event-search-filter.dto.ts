export interface EventSearchFilters {
    hardFilters: {
        eventType?: string[];
        category?: string[];
        skillLevel?: string[];
        eligibleArtistTypes?: string[];

        locationType?: 'physical' | 'online' | 'hybrid';
        city?: string;
        onlineOnly?: boolean;

        startDateAfter?: Date;
        startDateBefore?: Date;
        registrationDeadlineBefore?: Date;

        freeOnly?: boolean;
        maxPrice?: number;
        refundableOnly?: boolean;
    };

    boostSignals: {
        featured?: boolean;
        startingSoon?: boolean;
        popular?: boolean;
        lowPrice?: boolean;
    };

    sortMode: 'relevance' | 'soonest' | 'mostPopular' | 'lowestPrice';
}
