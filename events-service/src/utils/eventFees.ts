const NETSA_FEE_PERCENT = 0.5;
const PROCESSING_FEE_PERCENT = 2.36;

const roundPaise = (n: number): number => Math.round(n);

export interface FeeBreakdown {
  ticketSubtotalPaise: number;
  serviceFeePaise: number;
  netsaFeePaise: number;
  organizerNetPaise: number;
  customerPaysPaise: number;
}

/** All inputs/outputs in paise. unitPaise = price of one ticket in paise. */
export function computeFeesPaise(unitPaise: number, seats: number): FeeBreakdown {
  const ticketSubtotalPaise = unitPaise * seats;
  const serviceFeePaise = roundPaise(ticketSubtotalPaise * (PROCESSING_FEE_PERCENT / 100));
  const netsaFeePaise = roundPaise(ticketSubtotalPaise * (NETSA_FEE_PERCENT / 100));
  return {
    ticketSubtotalPaise,
    serviceFeePaise,
    netsaFeePaise,
    organizerNetPaise: ticketSubtotalPaise - netsaFeePaise,
    customerPaysPaise: ticketSubtotalPaise + serviceFeePaise,
  };
}
