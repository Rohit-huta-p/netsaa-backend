import EventTag from '../models/EventTag';

describe('EventTag schema', () => {
    it('accepts seed status', () => {
        const tag = new EventTag({
            _id: 'workshop',
            displayName: 'Workshop',
            status: 'seed',
            usageCount: 0,
        });
        const err = tag.validateSync();
        expect(err).toBeUndefined();
    });

    it('rejects status outside enum', () => {
        const tag = new EventTag({
            _id: 'workshop',
            displayName: 'Workshop',
            status: 'invalid' as any,
        });
        const err = tag.validateSync();
        expect(err?.errors['status']).toBeDefined();
    });

    it('rejects _id with uppercase (must be normalized)', () => {
        const tag = new EventTag({
            _id: 'Workshop',
            displayName: 'Workshop',
            status: 'seed',
        });
        const err = tag.validateSync();
        expect(err?.errors['_id']).toBeDefined();
    });

    it('rejects _id over 30 chars', () => {
        const tag = new EventTag({
            _id: 'a'.repeat(31),
            displayName: 'X',
            status: 'seed',
        });
        const err = tag.validateSync();
        expect(err?.errors['_id']).toBeDefined();
    });
});
