import request from 'supertest';
import express from 'express';
import similarRoutes from '../similar/similar.routes';

jest.mock('../similar/similar.service', () => ({
  similarService: {
    read: jest.fn().mockResolvedValue({ items: [], total: 0, computedAt: null }),
  },
}));

const app = express();
app.use('/discover', similarRoutes);

describe('Similar routes', () => {
  it('GET /discover/similar/:id returns 200 with rail limit=6 by default', async () => {
    const { similarService } = require('../similar/similar.service');
    similarService.read.mockClear();
    const res = await request(app).get('/discover/similar/abc');
    expect(res.status).toBe(200);
    expect(similarService.read).toHaveBeenCalledWith('abc', { limit: 6 });
  });

  it('GET /discover/similar/:id?limit=10 passes the custom limit', async () => {
    const { similarService } = require('../similar/similar.service');
    similarService.read.mockClear();
    await request(app).get('/discover/similar/abc?limit=10');
    expect(similarService.read).toHaveBeenCalledWith('abc', { limit: 10 });
  });

  it('GET /discover/similar/:id?page=2 switches to paginated mode (default pageSize=20)', async () => {
    const { similarService } = require('../similar/similar.service');
    similarService.read.mockClear();
    await request(app).get('/discover/similar/abc?page=2');
    expect(similarService.read).toHaveBeenCalledWith('abc', { page: 2, pageSize: 20 });
  });

  it('GET /discover/similar/:id?page=3&pageSize=10 paginates with custom pageSize', async () => {
    const { similarService } = require('../similar/similar.service');
    similarService.read.mockClear();
    await request(app).get('/discover/similar/abc?page=3&pageSize=10');
    expect(similarService.read).toHaveBeenCalledWith('abc', { page: 3, pageSize: 10 });
  });
});
