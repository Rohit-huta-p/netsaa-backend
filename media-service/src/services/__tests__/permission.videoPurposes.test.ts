import { checkUploadPermission, PermissionError } from '../permission.service';

describe('permission.service: video purposes (user + portfolio)', () => {
  it('allows user + portfolio for the owner (profile reel)', async () => {
    await expect(
      checkUploadPermission({
        user: { id: 'u1', role: 'artist' } as any,
        entityType: 'user',
        entityId: 'u1',
        purpose: 'portfolio',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-owner user upload', async () => {
    await expect(
      checkUploadPermission({
        user: { id: 'other', role: 'artist' } as any,
        entityType: 'user',
        entityId: 'u1',
        purpose: 'portfolio',
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it('rejects event + portfolio (purpose not allowed for entity)', async () => {
    await expect(
      checkUploadPermission({
        user: { id: 'u1', role: 'organizer' } as any,
        entityType: 'event',
        entityId: 'e1',
        purpose: 'portfolio',
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
