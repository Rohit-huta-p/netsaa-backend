import { tokenize, isCapitalizedNameToken, rawTokens } from '../intent/tokenize';

describe('tokenize', () => {
  it('lowercases and splits on whitespace + punctuation', () => {
    expect(tokenize('Kathak  Pune!')).toEqual(['kathak', 'pune']);
  });
  it('detects capitalized name tokens', () => {
    expect(tokenize('Priya Sharma kathak')).toEqual(['priya', 'sharma', 'kathak']);
  });
  it('preserves capitalization signal separately', () => {
    const t = tokenize('Priya Sharma');
    expect(t).toEqual(['priya', 'sharma']);
  });
  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('isCapitalizedNameToken', () => {
  it('accepts well-formed capitalized names', () => {
    expect(isCapitalizedNameToken('Priya')).toBe(true);
    expect(isCapitalizedNameToken('Sharma')).toBe(true);
  });
  it('rejects too short / too long / non-capitalized / non-alpha', () => {
    expect(isCapitalizedNameToken('Pr')).toBe(false);       // too short
    expect(isCapitalizedNameToken('A'.repeat(16))).toBe(false); // too long but pattern fails anyway
    expect(isCapitalizedNameToken('priya')).toBe(false);    // not capitalized
    expect(isCapitalizedNameToken('PRIYA')).toBe(false);    // all caps
    expect(isCapitalizedNameToken('Priya1')).toBe(false);   // digit
    expect(isCapitalizedNameToken('')).toBe(false);         // empty
  });
});

describe('rawTokens', () => {
  it('preserves case, splits on punctuation+whitespace', () => {
    expect(rawTokens('Priya Sharma kathak')).toEqual(['Priya', 'Sharma', 'kathak']);
    expect(rawTokens('Ankit, the kathak dancer')).toEqual(['Ankit', 'the', 'kathak', 'dancer']);
  });
  it('returns empty array for empty input', () => {
    expect(rawTokens('')).toEqual([]);
  });
});
