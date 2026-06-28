export type RefundWindow = 'full' | 'partial' | 'none';
export type RefundTrigger = 'attendee_cancel' | 'organizer_cancel' | 'reschedule_opt_out' | 'admin_force';

export interface RefundComputation {
  window: RefundWindow;
  refundAmountPaise: number;   // to the customer's instrument
  netsaAbsorbedPaise: number;  // NETSA-funded top-up (organizer-cancel only)
}

export function computeRefundPaise(event: any, registration: any, now: Date, trigger: RefundTrigger): RefundComputation {
  const ticketPaise = Math.round((event.ticketPrice || 0) * 100) * (registration.quantity || 1);
  const serviceFeePaise = registration.paymentRecord?.serviceFeePaise ?? 0;

  // Organizer-cancel / admin-force / reschedule opt-out: attendee made whole INCLUDING service fee
  if (trigger !== 'attendee_cancel') {
    return { window: 'full', refundAmountPaise: ticketPaise + serviceFeePaise, netsaAbsorbedPaise: serviceFeePaise };
  }

  // Attendee-cancel: honour the event's cancellation window; attendee eats the service fee
  const policy = event.cancellationPolicy || {};
  const t = now.getTime();
  const fullUntil = policy.fullRefundUntil ? new Date(policy.fullRefundUntil).getTime() : undefined;
  const partialUntil = policy.partialRefundUntil ? new Date(policy.partialRefundUntil).getTime() : undefined;

  if (fullUntil !== undefined && t <= fullUntil) {
    return { window: 'full', refundAmountPaise: ticketPaise, netsaAbsorbedPaise: 0 };
  }
  if (partialUntil !== undefined && t <= partialUntil) {
    const pct = policy.partialRefundPercent ?? 0;
    return { window: 'partial', refundAmountPaise: Math.round(ticketPaise * (pct / 100)), netsaAbsorbedPaise: 0 };
  }
  return { window: 'none', refundAmountPaise: 0, netsaAbsorbedPaise: 0 };
}
