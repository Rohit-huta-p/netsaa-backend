import { classifyIntent } from '../intent/classifier';
import corpus from './fixtures/intent-corpus.json';

describe('classifier corpus', () => {
  it.each(corpus)('classifies "$q" as $expect', ({ q, expect: expectedVertical }) => {
    const r = classifyIntent(q);
    expect(r.dominantVertical).toBe(expectedVertical);
  });
});
