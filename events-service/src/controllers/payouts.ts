import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { maskPan } from '../services/razorpay';
import { payments } from '../services/payments';

// @desc Submit payout account → create Cashfree Easy Split vendor (real KYC status)
// @route POST /v1/payouts/account
// @access Private
export const submitPayoutAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { businessType, pan, accountHolderName, bankAccount, ifsc, gstin, email } = req.body;

    if (!businessType || !pan || !bankAccount || !ifsc || !accountHolderName) {
      return res.status(400).json({ meta: { status: 400, message: 'Missing required fields' }, data: null, errors: [] });
    }

    // Stable vendor id = the organizer's userId. On re-submit, refresh the existing
    // vendor's status instead of re-creating it (bank-detail changes are the Sprint 2.5
    // re-verify path). createVendor/getVendorStatus return the REAL mapped Cashfree
    // status — no more hard-coded 'verified'. pending_kyc/rejected now actually fire.
    const existing = await UserPayoutAccount.findOne({ userId });
    const vendor = existing?.linkedAccountId
      ? await payments.getVendorStatus(existing.linkedAccountId)
      : await payments.createVendor({ vendorId: String(userId), name: accountHolderName, email, pan, businessType, bankAccount, ifsc });

    const status = vendor.status;

    const doc = await UserPayoutAccount.findOneAndUpdate(
      { userId },
      {
        userId, provider: 'cashfree', linkedAccountId: vendor.vendorId, status, businessType,
        panMasked: maskPan(pan), accountHolderName,
        bankLast4: bankAccount.slice(-4), bankName: 'Resolved from IFSC', ifsc,
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
