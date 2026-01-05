// search-service/src/config/assert-search-contract.ts

import { PEOPLE_SEARCH_CONTRACT } from './search.contract';

export function assertPeopleSearchPipeline(pipeline: any[]) {
    const pipelineString = JSON.stringify(pipeline);

    const forbidden = [
        'firstName',
        'lastName',
        'userName'
    ];

    for (const field of forbidden) {
        if (pipelineString.includes(field)) {
            throw new Error(
                `[SEARCH CONTRACT VIOLATION]
People search pipeline references non-existent field: "${field}"
`
            );
        }
    }
}
