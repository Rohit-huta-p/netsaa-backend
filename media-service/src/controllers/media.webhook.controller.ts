import { Request, Response } from 'express';
import { mux } from '../config/mux';
import { applyMuxEvent } from '../services/video.service';

// req.body is a Buffer here (see server.ts raw mount for this path).
export async function muxWebhookController(req: Request, res: Response): Promise<void> {
  let event: { type: string; data: any };
  try {
    const raw = (req.body as Buffer).toString('utf8');
    event = (await mux.webhooks.unwrap(raw, req.headers)) as any; // verifies signature, throws on mismatch
  } catch {
    res.status(400).json({ error: 'INVALID_SIGNATURE' });
    return;
  }
  // Ack fast; process without blocking Mux's delivery timeout.
  res.status(200).json({ received: true });
  try { await applyMuxEvent(event); } catch (e) { console.error('[muxWebhook] apply failed', e); }
}
