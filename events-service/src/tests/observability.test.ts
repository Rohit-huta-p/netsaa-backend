import { emit } from '../utils/observability';

describe('observability.emit', () => {
    let spy: jest.SpyInstance;
    beforeEach(() => { spy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());

    it('emits structured JSON with metric name + level + props', () => {
        emit('capacity_drift_detected', 'warn', { eventId: 'e1', stored: 10, computed: 12 });
        expect(spy).toHaveBeenCalledTimes(1);
        const arg = spy.mock.calls[0][0];
        const parsed = JSON.parse(arg);
        expect(parsed.metric).toBe('capacity_drift_detected');
        expect(parsed.level).toBe('warn');
        expect(parsed.eventId).toBe('e1');
        expect(parsed.ts).toBeDefined();
    });

    it('supports info/warn/error levels', () => {
        emit('auto_flag_triggered', 'info', { reason: 'url' });
        emit('reservation_compensation_failed', 'error', { eventId: 'e1' });
        const levels = spy.mock.calls.map((c) => JSON.parse(c[0]).level);
        expect(levels).toEqual(['info', 'error']);
    });
});
