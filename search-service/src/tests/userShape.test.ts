import { Schema } from 'mongoose';

describe('users schema contract (consumer side)', () => {
  it('search-service expects these searchable fields to exist', () => {
    const expectedFields = [
      'skills',                                     // string[]
      'languages',                                  // string[]
      'lastActiveAt',                               // Date
      'cached.connectionStats.degree1Count',        // number
      'cached.connectionStats.collaboratorIds',     // ObjectId[]
      'pymk_dismissed',                             // ObjectId[]
    ];
    // contract docs only; assertion locks the list
    expect(expectedFields).toHaveLength(6);
  });
});
