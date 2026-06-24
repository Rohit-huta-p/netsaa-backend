/**
 * CSV money-totals header builder for the roster export.
 * Extracted from csvExport.controller.ts so the math is testable without
 * booting the Express app (which has slow ts-jest cold-compile cost).
 *
 * Mirrors RAZORPAY_PRICING_UX.md Tier 2 — paid events get a money-totals
 * block in the DPDP header reporting Gross / NETSA fee / Net / Service fee
 * collected / Customer-paid total. Free events get no block.
 */

/** Round to 2 decimals (paise) to match backend's stored amounts. */
export function roundPaise(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Indian-grouped rupee string with no currency symbol, suitable for plaintext CSV. */
export function formatRupeesPlain(amount: number): string {
    const isInt = Number.isInteger(amount);
    return amount.toLocaleString('en-IN', {
        minimumFractionDigits: isInt ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

interface RegistrationRow {
    paymentStatus?: string;
    ticketAmount?: number;
    serviceFeeAmount?: number;
    paidAmount?: number;
}

interface EventLike {
    registrationMode?: string;
}

/**
 * Return the array of CSV header lines for the money totals block.
 * Empty array for free events or when no rows have payment data.
 */
export function computeMoneyHeaderLines(
    event: EventLike | null | undefined,
    rows: RegistrationRow[],
    netsaFeePercent: number = Number(process.env.NETSA_FEE_PERCENT ?? 0.5),
): string[] {
    const isPaid = event?.registrationMode === 'paid_ticket';
    if (!isPaid) return [];

    const completedRows = rows.filter(
        (r) => r.paymentStatus === 'completed' || (Number(r.ticketAmount) || 0) > 0,
    );
    if (completedRows.length === 0) return [];

    const ticketGross = completedRows.reduce(
        (acc, r) => acc + (Number(r.ticketAmount) || 0),
        0,
    );
    const customerTotal = completedRows.reduce(
        (acc, r) => acc + (Number(r.paidAmount) || 0),
        0,
    );
    const serviceFeeCollected = completedRows.reduce(
        (acc, r) => acc + (Number(r.serviceFeeAmount) || 0),
        0,
    );
    const netsaFee = roundPaise(ticketGross * (netsaFeePercent / 100));
    const netToOrganizer = roundPaise(ticketGross - netsaFee);

    return [
        '# Money totals (paid event)',
        `# Gross revenue (ticket × paid registrations): ₹${formatRupeesPlain(roundPaise(ticketGross))}`,
        `# NETSA platform fee (${netsaFeePercent}%): ₹${formatRupeesPlain(netsaFee)}`,
        `# Net to you (after NETSA fee): ₹${formatRupeesPlain(netToOrganizer)}`,
        `# Service fee collected from customers (covers Razorpay MDR): ₹${formatRupeesPlain(roundPaise(serviceFeeCollected))}`,
        `# Customer-paid total (ticket + service fee): ₹${formatRupeesPlain(roundPaise(customerTotal))}`,
        `# Paid registrations counted: ${completedRows.length} of ${rows.length} total`,
        '#',
    ];
}
