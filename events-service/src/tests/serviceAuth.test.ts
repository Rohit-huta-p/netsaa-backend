process.env.INTERNAL_SERVICE_TOKEN = 'secret-token';
import { requireServiceToken } from '../middleware/serviceAuth';

const mockRes = () => { const r: any = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };

describe('requireServiceToken', () => {
  it('rejects a missing/wrong token', () => {
    const res = mockRes(); const next = jest.fn();
    requireServiceToken({ headers: { authorization: 'Bearer nope' } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  it('passes the correct token', () => {
    const res = mockRes(); const next = jest.fn();
    requireServiceToken({ headers: { authorization: 'Bearer secret-token' } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});
