// search-service/src/config/search.contract.ts

export const PEOPLE_SEARCH_CONTRACT = {
    indexName: 'people_search_index',

    autocompleteFields: ['displayName'],

    textFields: [
        'artistType',
        'skills',
        'experience',
        'location',
        'instagramHandle'
    ],

    filterFields: [
        'blocked',
        'role',
        'cached.primaryCity',
        'cached.featured'
    ]
};
