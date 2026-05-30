import request from 'supertest';
import express from 'express';
import pymkRoutes from '../pymk/pymk.routes';

jest.mock('../pymk/pymk.service', () => ({
  pymkService: {
    read: jest.fn().mockResolvedValue({
      items: [], total: 0, page: 1, pageSize: 10, strategy: 'graph', computedAt: null,
    }),
  },
}));
jest.mock('../pymk/pymk.dismiss', () => ({
  dismissArtist: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use('/discover', pymkRoutes);
app.use('/pymk', pymkRoutes);

describe('PYMK routes', () => {
  it('GET /discover/pymk returns 200 with strategy', async () => {
    const res = await request(app).get('/discover/pymk?viewerId=u1');
    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe('graph');
  });

  it('GET /discover/pymk returns 401 when viewerId missing', async () => {
    const res = await request(app).get('/discover/pymk');
    expect(res.status).toBe(401);
  });

  it('GET /discover/pymk passes page + pageSize correctly', async () => {
    const { pymkService } = require('../pymk/pymk.service');
    pymkService.read.mockClear();
    await request(app).get('/discover/pymk?viewerId=u1&page=2&pageSize=20');
    expect(pymkService.read).toHaveBeenCalledWith('u1', 2, 20);
  });

  it('POST /pymk/dismiss returns 204', async () => {
    const res = await request(app).post('/pymk/dismiss').send({ artistId: 'a1', viewerId: 'u1' });
    expect(res.status).toBe(204);
  });

  it('POST /pymk/dismiss returns 400 when artistId missing', async () => {
    const res = await request(app).post('/pymk/dismiss').send({ viewerId: 'u1' });
    expect(res.status).toBe(400);
  });
});
