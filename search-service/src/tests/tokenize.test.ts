import { tokenize } from '../intent/tokenize';

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
