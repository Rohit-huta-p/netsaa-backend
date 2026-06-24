import {
    computeMoneyHeaderLines,
    formatRupeesPlain,
    roundPaise,
} from '../utils/csvMoneyTotals';

describe('csvMoneyTotals', () => {
    describe('roundPaise', () => {
        it('rounds to 2 decimals', () => {
            expect(roundPaise(11.7764)).toBe(11.78);
            expect(roundPaise(35.3292)).toBe(35.33);
            expect(roundPaise(2.495)).toBe(2.5);
        });
    });

    describe('formatRupeesPlain', () => {
        it('drops decimals for integers, uses Indian grouping', () => {
            expect(formatRupeesPlain(1996)).toBe('1,996');
            expect(formatRupeesPlain(100000)).toBe('1,00,000');
        });
        it('keeps 2 decimals for fractional', () => {
            expect(formatRupeesPlain(35.33)).toBe('35.33');
            expect(formatRupeesPlain(1986.02)).toBe('1,986.02');
        });
    });

    describe('computeMoneyHeaderLines', () => {
        it('paid event with two completed rows → full totals block', () => {
            const event = { registrationMode: 'paid_ticket' };
            const rows = [
                { paymentStatus: 'completed', ticketAmount: 499, serviceFeeAmount: 11.78, paidAmount: 510.78 },
                { paymentStatus: 'completed', ticketAmount: 1497, serviceFeeAmount: 35.33, paidAmount: 1532.33 },
            ];
            const lines = computeMoneyHeaderLines(event, rows, 0.5);
            const blob = lines.join('\n');

            // Total ticketAmount = 1996
            expect(blob).toMatch(/Gross revenue.*1,996/);
            // NETSA fee 0.5% = 9.98
            expect(blob).toMatch(/NETSA platform fee.*0\.5%.*9\.98/);
            // Net = 1996 - 9.98 = 1986.02
            expect(blob).toMatch(/Net to you.*1,986\.02/);
            // Customer-paid total = 2043.11
            expect(blob).toMatch(/Customer-paid total.*2,043\.11/);
            // Service fee collected = 47.11
            expect(blob).toMatch(/Service fee collected.*47\.11/);
            // Counter
            expect(blob).toMatch(/Paid registrations counted: 2 of 2/);
        });

        it('free event → empty array', () => {
            const event = { registrationMode: 'free_rsvp' };
            const rows = [{ paymentStatus: 'completed', ticketAmount: 100, serviceFeeAmount: 2.36, paidAmount: 102.36 }];
            expect(computeMoneyHeaderLines(event, rows, 0.5)).toEqual([]);
        });

        it('paid event with no payments yet → empty array (no useless zero block)', () => {
            const event = { registrationMode: 'paid_ticket' };
            const rows = [
                { paymentStatus: 'pending', ticketAmount: 0 },
                { paymentStatus: 'failed', ticketAmount: 0 },
            ];
            expect(computeMoneyHeaderLines(event, rows, 0.5)).toEqual([]);
        });

        it('mixed: only completed rows count toward totals', () => {
            const event = { registrationMode: 'paid_ticket' };
            const rows = [
                { paymentStatus: 'completed', ticketAmount: 499, serviceFeeAmount: 11.78, paidAmount: 510.78 },
                { paymentStatus: 'failed', ticketAmount: 0 },
                { paymentStatus: 'refunded', ticketAmount: 499, serviceFeeAmount: 11.78, paidAmount: 510.78 },
            ];
            const lines = computeMoneyHeaderLines(event, rows, 0.5);
            const blob = lines.join('\n');
            // Only the one completed + the refunded row with ticketAmount > 0 = 2 of 3
            // Refunded rows still booked the gross at order time; they get caught by
            // the `ticketAmount > 0` fallback. Refund tracking is a separate column
            // (planned in Plan 8 follow-up).
            expect(blob).toMatch(/Paid registrations counted: 2 of 3/);
            expect(blob).toMatch(/Gross revenue.*998/);
        });

        it('null event → empty array (defensive)', () => {
            expect(computeMoneyHeaderLines(null, [], 0.5)).toEqual([]);
            expect(computeMoneyHeaderLines(undefined, [], 0.5)).toEqual([]);
        });

        it('respects custom netsaFeePercent override', () => {
            const event = { registrationMode: 'paid_ticket' };
            const rows = [{ paymentStatus: 'completed', ticketAmount: 1000, paidAmount: 1023.6 }];
            const lines = computeMoneyHeaderLines(event, rows, 1.0); // 1% instead of 0.5%
            const blob = lines.join('\n');
            expect(blob).toMatch(/NETSA platform fee.*1%.*10/);
            expect(blob).toMatch(/Net to you.*990/);
        });
    });
});
