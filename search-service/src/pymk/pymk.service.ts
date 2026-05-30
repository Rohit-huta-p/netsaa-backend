import { PymkRecommendation } from './pymk.model';
import { buildColdStart } from './pymk.coldstart';
import { enrichPeopleResults } from '../modules/enrichment/enrich.people';

export interface PymkReadResult {
  items: any[];
  page: number;
  pageSize: number;
  total: number;
  strategy: 'graph' | 'contacts' | 'craft-city';
  computedAt: Date | null;
}

export const pymkService = {
  async read(viewerId: string, page = 1, pageSize = 10): Promise<PymkReadResult> {
    const doc = await PymkRecommendation.findOne({ userId: viewerId } as any);
    let fullList: any[];
    let strategy: PymkReadResult['strategy'];
    let computedAt: Date | null;

    if (doc) {
      fullList = doc.list ?? [];
      strategy = doc.strategy;
      computedAt = doc.computedAt;
    } else {
      const cold = await buildColdStart(viewerId);
      fullList = cold.list;
      strategy = cold.strategy;
      computedAt = null;
    }

    const start = (page - 1) * pageSize;
    const slice = fullList.slice(start, start + pageSize);
    const ids = slice.map((it: any) => it.artistId.toString());
    const enriched = ids.length ? await enrichPeopleResults(ids) : [];

    const byId = new Map(enriched.map((e: any) => [e._id.toString(), e]));
    const items = slice
      .map((it: any) => {
        const e = byId.get(it.artistId.toString());
        return e ? { ...e, reasons: it.reasons, mutualCount: it.mutualCount } : null;
      })
      .filter((x: any) => x !== null);

    return { items, page, pageSize, total: fullList.length, strategy, computedAt };
  },
};
