/**
 * Tests for Plan 6 Task 16 — Cross-Service Event Notification Subtypes.
 *
 * Verifies that:
 * 1. EVENT_SUBTYPES has exactly 10 values.
 * 2. Every subtype maps to an entry in EVENT_CHANNEL_FLAGS.
 * 3. High-severity subtypes (cancelled) fan out to the correct channels.
 * 4. Digest-path subtypes (new_registration) correctly suppress push.
 *
 * No DB or Redis connection required — pure unit tests over typed constants.
 */

import { EVENT_SUBTYPES } from '../notification.types';
import { EVENT_CHANNEL_FLAGS } from '../notification.factory';

describe('Event notification subtypes', () => {
    it('exports exactly 10 subtypes', () => {
        expect(EVENT_SUBTYPES).toHaveLength(10);
    });

    it('each subtype has a channel-flag entry', () => {
        EVENT_SUBTYPES.forEach((s) => {
            expect(EVENT_CHANNEL_FLAGS[s]).toBeDefined();
        });
    });

    it('cancellation triggers push + email + whatsapp + inapp', () => {
        const f = EVENT_CHANNEL_FLAGS['event.cancelled'];
        expect(f.push).toBe(true);
        expect(f.email).toBe(true);
        expect(f.whatsapp).toBe(true);
        expect(f.inapp).toBe(true);
    });

    it('digest path (new_registration) does NOT push', () => {
        const f = EVENT_CHANNEL_FLAGS['event.new_registration'];
        expect(f.push).toBe(false);
        expect(f.inapp).toBe(true); // captured for hourly digest
    });
});
