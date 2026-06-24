import { SimilarArtists } from './similar.model';
import { buildSimilarFallback } from './similar.fallback';
import { enrichPeopleResults } from '../modules/enrichment/enrich.people';

export interface SimilarReadOpts {
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface SimilarReadResult {
  items: any[];
  total: number;
  computedAt: Date | null;
}

export const similarService = {
  async read(artistId: string, opts: SimilarReadOpts): Promise<SimilarReadResult> {
    const doc = await SimilarArtists.findOne({ artistId } as any);
    let list: any[];
    let computedAt: Date | null;

    if (doc) {
      list = doc.list ?? [];
      computedAt = doc.computedAt;
    } else {
      list = await buildSimilarFallback(artistId);
      computedAt = null;
    }

    const total = list.length;

    let slice: any[];
    if (opts.page !== undefined && opts.pageSize !== undefined) {
      const start = (opts.page - 1) * opts.pageSize;
      slice = list.slice(start, start + opts.pageSize);
    } else {
      slice = list.slice(0, opts.limit ?? 6);
    }

    const ids = slice.map((it: any) => it.peerId.toString());
    const enriched = ids.length ? await enrichPeopleResults(ids) : [];
    const byId = new Map(enriched.map((e: any) => [e._id.toString(), e]));
    const items = slice
      .map((it: any) => {
        const e = byId.get(it.peerId.toString());
        return e ? { ...e, reasons: it.reasons } : null;
      })
      .filter((x: any) => x !== null);

    return { items, total, computedAt };
  },
};
