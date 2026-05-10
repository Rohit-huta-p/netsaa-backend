import { checkAutoFlag, AUTO_FLAG_PATTERNS } from '../utils/autoFlag';

describe('autoFlag', () => {
    describe('external_payment patterns', () => {
        it('flags UPI mentions', () => {
            const r = checkAutoFlag('Send payment via UPI to abc@bank');
            expect(r.flagged).toBe(true);
            expect(r.reasons).toContain('external_payment');
        });

        it('flags Paytm', () => {
            expect(checkAutoFlag('paytm me at 9876543210').flagged).toBe(true);
        });

        it('flags GPay / PhonePe', () => {
            expect(checkAutoFlag('use gpay or phonepe please').flagged).toBe(true);
        });

        it('flags bank account', () => {
            expect(checkAutoFlag('transfer to my Bank Account').flagged).toBe(true);
        });

        it('flags IFSC', () => {
            expect(checkAutoFlag('IFSC: HDFC0001234').flagged).toBe(true);
        });
    });

    describe('contact_in_field patterns', () => {
        it('flags Indian phone numbers', () => {
            expect(checkAutoFlag('Call 9876543210').flagged).toBe(true);
            expect(checkAutoFlag('+91-9876543210 to register').flagged).toBe(true);
        });

        it('flags emails', () => {
            expect(checkAutoFlag('Email me at producer@studio.com').flagged).toBe(true);
        });

        it('does NOT flag normal text', () => {
            expect(checkAutoFlag('Bring 2 contrasting pieces').flagged).toBe(false);
        });
    });

    describe('off_platform patterns', () => {
        it('flags "DM me"', () => {
            expect(checkAutoFlag('DM me on Instagram').flagged).toBe(true);
        });

        it('flags WhatsApp / Telegram references', () => {
            expect(checkAutoFlag('whatsapp me your reel').flagged).toBe(true);
            expect(checkAutoFlag('telegram us').flagged).toBe(true);
        });

        it('flags Instagram handles', () => {
            expect(checkAutoFlag('contact me on instagram').flagged).toBe(true);
        });
    });

    describe('url patterns', () => {
        it('flags https URLs', () => {
            expect(checkAutoFlag('Apply at https://example.com').flagged).toBe(true);
        });

        it('flags www URLs without protocol', () => {
            expect(checkAutoFlag('see www.castingcrowd.in').flagged).toBe(true);
        });
    });

    describe('clean content', () => {
        it('does not flag legitimate event description', () => {
            const safe = 'Open call audition for a Netflix India period drama set in 19th-century Tanjore. Looking for two lead dancers with deep classical training.';
            expect(checkAutoFlag(safe).flagged).toBe(false);
            expect(checkAutoFlag(safe).reasons).toEqual([]);
        });
    });

    describe('multiple flags', () => {
        it('reports all matched reasons', () => {
            const r = checkAutoFlag('DM me at 9876543210 and visit https://x.com');
            expect(r.flagged).toBe(true);
            expect(r.reasons).toEqual(expect.arrayContaining(['off_platform', 'contact_in_field', 'url']));
        });
    });
});
