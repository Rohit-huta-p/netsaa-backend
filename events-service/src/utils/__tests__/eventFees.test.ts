import { computeFeesPaise } from '../eventFees';

describe('computeFeesPaise', () => {
  it('matches eventPricing.ts for ₹4,500 × 1 seat', () => {
    const f = computeFeesPaise(450000, 1); // ticketPaise=450000 (₹4500)
    expect(f.ticketSubtotalPaise).toBe(450000);
    expect(f.serviceFeePaise).toBe(10620);     // 2.36% of 4500 = ₹106.20
    expect(f.netsaFeePaise).toBe(2250);        // 0.5% of 4500 = ₹22.50
    expect(f.organizerNetPaise).toBe(447750);  // 4500 − 22.50 = ₹4477.50
    expect(f.customerPaysPaise).toBe(460620);  // 4500 + 106.20 = ₹4606.20
  });

  it('scales for groups (₹4,500 × 3)', () => {
    const f = computeFeesPaise(450000, 3);
    expect(f.ticketSubtotalPaise).toBe(1350000);
    expect(f.serviceFeePaise).toBe(31860);     // 2.36% of 13500 = ₹318.60
    expect(f.customerPaysPaise).toBe(1381860); // ₹13,818.60
  });
});
