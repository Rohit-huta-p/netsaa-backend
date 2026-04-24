// netsa-backend/gigs-service/src/tests/fixtures/gigFactory.ts
//
// Returns a payload valid against gigValidationSchema with no conditional
// requirements triggered (no Model, no Music Producer, future startDate).
// Tests override specific fields via the second argument to exercise rules.

export function makeGigPayload(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7d
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);      // +1h
  const applicationDeadline = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // -1d

  return {
    title: 'Test gig',
    description: 'A test gig.',
    type: 'one-time',
    tags: [],
    artistTypes: ['Dancer'],
    requiredSkills: [],
    experienceLevel: 'intermediate',
    location: {
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      venueName: '',
      address: '',
      isRemote: false
    },
    schedule: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    },
    compensation: {
      model: 'fixed',
      amount: 5000,
      currency: 'INR',
      negotiable: false,
      perks: []
    },
    applicationDeadline: applicationDeadline.toISOString(),
    ...overrides
  };
}
