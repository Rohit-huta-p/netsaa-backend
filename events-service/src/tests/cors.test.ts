import request from 'supertest';
import app from '../server';

// The register/reserve endpoints send a custom `Idempotency-Key` request header.
// On web, the browser preflights it — if CORS doesn't allow the header, the call is
// blocked with a CORS error. This locks the header into the allow-list.
describe('CORS preflight', () => {
  it('allows the Idempotency-Key header for the register endpoint', async () => {
    const res = await request(app)
      .options('/v1/events/anyid/register')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'idempotency-key');

    const allow = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allow).toContain('idempotency-key');
    expect(allow).toContain('authorization');
  });
});
