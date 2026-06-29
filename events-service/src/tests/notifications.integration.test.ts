import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';

process.env.JWT_SECRET = 'test-secret';
const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

describe('GET /v1/users/me/notifications/preferences', () => {
  it('returns sensible defaults when none saved', async () => {
    const res = await request(app).get('/v1/users/me/notifications/preferences').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reminders.push).toBe(true);
    expect(res.body.data.reminders.sms).toBe(true);
    expect(res.body.data.announcements.sms).toBe(false);
  });
});

describe('PATCH /v1/users/me/notifications/preferences', () => {
  it('updates a single cell and persists', async () => {
    await request(app).patch('/v1/users/me/notifications/preferences')
      .set('Authorization', `Bearer ${token}`).send({ announcements: { sms: true } });
    const res = await request(app).get('/v1/users/me/notifications/preferences').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.announcements.sms).toBe(true);
    expect(res.body.data.reminders.push).toBe(true); // untouched cells preserved
  });
});
