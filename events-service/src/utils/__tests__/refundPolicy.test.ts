import { computeRefundPaise } from '../refundPolicy';

const TICKET_PAISE = 450000; // ₹4,500
const SERVICE_PAISE = 10620; // ₹106.20

function evt(policy: any) {
  return { ticketPrice: 4500, cancellationPolicy: policy } as any;
}
function reg() {
  return {
    quantity: 1,
    paymentRecord: { amountPaise: 460620, serviceFeePaise: SERVICE_PAISE },
  } as any;
}

describe('computeRefundPaise', () => {
  const now = new Date('2026-04-10T12:00:00Z');

  it('full refund before fullRefundUntil (attendee eats service fee)', () => {
    const r = computeRefundPaise(evt({ fullRefundUntil: '2026-04-11T00:00:00Z' }), reg(), now, 'attendee_cancel');
    expect(r.window).toBe('full');
    expect(r.refundAmountPaise).toBe(TICKET_PAISE); // ticket only
    expect(r.netsaAbsorbedPaise).toBe(0);
  });

  it('partial refund between full and partial cutoffs', () => {
    const policy = { fullRefundUntil: '2026-04-09T00:00:00Z', partialRefundUntil: '2026-04-11T00:00:00Z', partialRefundPercent: 50 };
    const r = computeRefundPaise(evt(policy), reg(), now, 'attendee_cancel');
    expect(r.window).toBe('partial');
    expect(r.refundAmountPaise).toBe(225000); // 50% of ₹4,500
  });

  it('no refund after partial cutoff', () => {
    const policy = { fullRefundUntil: '2026-04-08T00:00:00Z', partialRefundUntil: '2026-04-09T00:00:00Z', partialRefundPercent: 50 };
    const r = computeRefundPaise(evt(policy), reg(), now, 'attendee_cancel');
    expect(r.window).toBe('none');
    expect(r.refundAmountPaise).toBe(0);
  });

  it('organizer-cancel refunds ticket + service fee, NETSA absorbs the fee', () => {
    const r = computeRefundPaise(evt({}), reg(), now, 'organizer_cancel');
    expect(r.window).toBe('full');
    expect(r.refundAmountPaise).toBe(TICKET_PAISE + SERVICE_PAISE); // attendee made whole
    expect(r.netsaAbsorbedPaise).toBe(SERVICE_PAISE);
  });
});
