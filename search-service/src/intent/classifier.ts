import type { IntentResult, Vertical } from '../types/search.types';
import { CRAFT_DICT, EVENT_TYPE_DICT, GIG_TYPE_DICT, CITY_DICT, MONTH_DICT } from './dictionaries';
import { tokenize, rawTokens, isCapitalizedNameToken } from './tokenize';

export function classifyIntent(query: string): IntentResult {
  const tokens = tokenize(query);
  const rawT = rawTokens(query);

  const crafts: string[] = [];
  const cities: string[] = [];
  const months: string[] = [];
  const eventTypes: string[] = [];
  const gigTypes: string[] = [];
  const names: string[] = [];

  for (const t of tokens) {
    if (CRAFT_DICT.has(t)) crafts.push(t);
    if (CITY_DICT.has(t)) cities.push(t);
    if (MONTH_DICT.has(t)) months.push(t);
    if (EVENT_TYPE_DICT.has(t)) eventTypes.push(t);
    if (GIG_TYPE_DICT.has(t)) gigTypes.push(t);
  }

  for (const r of rawT) {
    const lower = r.toLowerCase();
    if (
      isCapitalizedNameToken(r) &&
      !CRAFT_DICT.has(lower) &&
      !CITY_DICT.has(lower) &&
      !MONTH_DICT.has(lower) &&
      !EVENT_TYPE_DICT.has(lower) &&
      !GIG_TYPE_DICT.has(lower)
    ) {
      names.push(r);
    }
  }

  const people = 3 * names.length + 1 * crafts.length + 0.5 * cities.length;
  const gigs   = 3 * gigTypes.length + 1.5 * months.length + 0.5 * cities.length;
  const events = 3 * eventTypes.length + 1 * months.length + 0.5 * cities.length;

  const scores: Record<Vertical, number> = { people, gigs, events };
  const sum = people + gigs + events;
  const max = Math.max(people, gigs, events);

  let dominantVertical: Vertical = 'people';
  if (sum > 0) {
    if (people === max && people > 0) dominantVertical = 'people';
    else if (events === max && events > 0) dominantVertical = 'events';
    else if (gigs === max && gigs > 0) dominantVertical = 'gigs';
  }

  const confidence = sum > 0 ? max / sum : 0;

  return {
    scores,
    dominantVertical,
    confidence,
    extracted: { crafts, cities, months, names },
  };
}
