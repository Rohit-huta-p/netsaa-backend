import mongoose from 'mongoose';

export interface SearchResult {
    _id: string;
    score: number;
}

export interface SearchResponse {
    results: SearchResult[];
    total: number;
}

export class AtlasClient {
    /**
     * Executes a search pipeline against a given collection.
     * Expected to return a 'data' array and a 'metadata' array (from $facet).
     */
    async executeSearch(
        collectionName: string,
        pipeline: any[]
    ): Promise<SearchResponse> {
        if (!mongoose.connection.db) {
            throw new Error('Database connection not established');
        }

        const result = await mongoose.connection.db
            .collection(collectionName)
            .aggregate(pipeline)
            .toArray();
        console.log('[Atlas raw result]', JSON.stringify(result, null, 2));

        let data: any[] = [];
        let total = 0;

        // Check if result is faceted (standard pipeline) or flat (simple pipeline)
        const isFaceted = result.length > 0 && ('data' in result[0] || 'metadata' in result[0]);

        if (isFaceted) {
            const root = result[0] ?? {};
            data = root.data ?? [];
            const metadata = root.metadata ?? [];
            total = Array.isArray(metadata) && metadata.length > 0 ? metadata[0].total : data.length;
        } else {
            // Flat result from simple $search pipeline
            data = result;
            total = result.length;
        }

        const results: SearchResult[] = data.map((item: any) => ({
            _id: item._id.toString(),
            score: item.score ?? 0,
            // Include other fields for debugging or if needed by caller
            ...item
        }));

        return { results, total };
    }

}

export const atlasClient = new AtlasClient();
