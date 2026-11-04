import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { maskPan } from '../services/razorpay';
import { payments } from '../services/payments';
import { verifyBankAccount, verifyVpa, isNameMatchAcceptable } from '../services/payments/cashfreeVerification';

/** Mask a UPI VPA for at-rest storage: keep the first 2 chars + domain. 'rohit@okhdfc' → 'ro***@okhdfc'. */
function maskVpa(vpa: string): string {
  const [name, domain] = vpa.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

// @desc Submit payout account → create Cashfree Easy Split vendor (real KYC status)
// @route POST /v1/payouts/account
// @access Private
export const submitPayoutAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { businessType, pan, accountHolderName, bankAccount, ifsc, gstin, email } = req.body;
    const vpa: string | undefined = typeof req.body.vpa === 'string' ? req.body.vpa.trim() : undefined;

    // UPI-first: a payout destination is EITHER a UPI VPA or a bank account (never both).
    // Honor an explicit `method`, else infer from what was supplied (vpa → upi).
    const method: 'upi' | 'bank' =
      req.body.method === 'bank' ? 'bank' : req.body.method === 'upi' ? 'upi' : vpa ? 'upi' : 'bank';
    const hasDestination = method === 'upi' ? !!vpa : !!(bankAccount && ifsc);

    if (!businessType || !pan || !accountHolderName || !hasDestination) {
      return res.status(400).json({ meta: { status: 400, message: 'Missing required fields' }, data: null, errors: [] });
    }

    // Stable vendor id = the organizer's userId. On re-submit, refresh the existing
    // vendor's status instead of re-creating it. createVendor/getVendorStatus return the
    // REAL mapped Cashfree status — no hard-coded 'verified'; pending_kyc/rejected fire.
    // The Easy Split vendor is created from a VPA (UPI) or bank + IFSC — never both.
    const existing = await UserPayoutAccount.findOne({ userId });
    const vendor = existing?.linkedAccountId
      ? await payments.getVendorStatus(existing.linkedAccountId)
      : await payments.createVendor(
          method === 'upi'
            ? { vendorId: String(userId), name: accountHolderName, email, pan, businessType, vpa }
            : { vendorId: String(userId), name: accountHolderName, email, pan, businessType, bankAccount, ifsc },
        );

    const status = vendor.status;

    const doc = await UserPayoutAccount.findOneAndUpdate(
      { userId },
      {
        userId, provider: 'cashfree', linkedAccountId: vendor.vendorId, status, businessType,
        panMasked: maskPan(pan), accountHolderName, payoutMethod: method,
        ...(method === 'upi'
          ? { upiVpaMasked: maskVpa(vpa as string) }
          : { bankLast4: (bankAccount as string).slice(-4), bankName: 'Resolved from IFSC', ifsc }),
        ...(gstin ? { gstin } : {}),
        ...(status === 'rejected' && vendor.raw ? { rejectionReason: vendor.raw } : {}),
        submittedAt: new Date(),
        ...(status === 'verified' ? { verifiedAt: new Date() } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({ meta: { status: 201, message: 'Payout account submitted' }, data: doc, errors: [] });
  } catch (err) {
    return res.status(400).json({ meta: { status: 400, message: 'Payout setup failed' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

// @route GET /v1/payouts/account/me
export const getMyPayoutAccount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const doc = await UserPayoutAccount.findOne({ userId });
  if (!doc) {
    return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: { status: 'not_started' }, errors: [] });
  }
  return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: doc, errors: [] });
};

// @route PATCH /v1/payouts/account/me  (bank/GST change → re-verify)
export const updatePayoutAccount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const doc = await UserPayoutAccount.findOne({ userId });
  if (!doc) return res.status(404).json({ meta: { status: 404, message: 'No payout account' }, data: null, errors: [] });
  // Re-verification path is Sprint 2.5; for now allow GST add without re-verify.
  if (req.body.gstin) { doc.gstin = req.body.gstin; await doc.save(); }
  return res.status(200).json({ meta: { status: 200, message: 'Updated' }, data: doc, errors: [] });
};

// @desc Verify a bank account (acct + IFSC) in real time via Cashfree Secure ID. Pre-submit
//       check — stateless; the wizard uses the result to confirm before onboarding.
// @route POST /v1/payouts/verify-bank
export const verifyBankHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { bankAccount, ifsc, accountHolderName } = req.body;
    if (!bankAccount || !ifsc) {
      return res.status(400).json({ meta: { status: 400, message: 'bankAccount and ifsc required' }, data: null, errors: [] });
    }
    const result = await verifyBankAccount({ bankAccount, ifsc, name: accountHolderName });
    return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: { ...result, nameMatchAcceptable: isNameMatchAcceptable(result) }, errors: [] });
  } catch (err) {
    // Secure ID not provisioned / provider hiccup → 502 so the FE shows "couldn't verify, retry".
    return res.status(502).json({ meta: { status: 502, message: 'Verification unavailable' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

// @desc Verify a UPI VPA in real time via Cashfree Secure ID. Pre-submit check (UPI-first).
// @route POST /v1/payouts/verify-upi
export const verifyUpiHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { vpa, accountHolderName } = req.body;
    if (!vpa) {
      return res.status(400).json({ meta: { status: 400, message: 'vpa required' }, data: null, errors: [] });
    }
    const result = await verifyVpa({ vpa, name: accountHolderName });
    return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: { ...result, nameMatchAcceptable: isNameMatchAcceptable(result) }, errors: [] });
  } catch (err) {
    return res.status(502).json({ meta: { status: 502, message: 'Verification unavailable' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
