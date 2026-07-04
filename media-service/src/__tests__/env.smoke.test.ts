import { env } from '../config/env';

it('env loads with mux + internal config', () => {
  expect(env.mux.tokenId).toBe('test-mux-id');
  expect(env.internalServiceToken).toBe('test-internal-token');
  expect(env.eventsServiceUrl).toBe('http://localhost:5003');
});
