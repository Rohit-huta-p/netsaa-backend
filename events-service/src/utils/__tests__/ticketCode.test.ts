import { generateTicketCode, generateBackupCode } from '../ticketCode';

describe('ticketCode', () => {
  describe('generateTicketCode', () => {
    it('produces a prefixed uppercase code', () => {
      const code = generateTicketCode('Kathak Foundations');
      expect(code).toMatch(/^KF-[A-Z0-9]{4}$/);
    });
    it('falls back to NS prefix when title has no usable initials', () => {
      const code = generateTicketCode('!!!');
      expect(code).toMatch(/^NS-[A-Z0-9]{4}$/);
    });
    it('is unique across many calls', () => {
      const codes = new Set(Array.from({ length: 500 }, () => generateTicketCode('Test Event')));
      expect(codes.size).toBeGreaterThan(490); // allow rare collision
    });
  });

  describe('generateBackupCode', () => {
    it('produces a 6-digit numeric string', () => {
      expect(generateBackupCode()).toMatch(/^\d{6}$/);
    });
  });
});
