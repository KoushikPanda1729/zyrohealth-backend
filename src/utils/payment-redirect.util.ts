// Where a Stripe Checkout Session sends the customer back to after
// paying/cancelling. The web frontend's FRONTEND_URL only exists on this
// machine's LAN/localhost — a phone's browser can never reach it, whether
// the checkout was opened from the mobile app or from a WhatsApp chat link.
// 'app' redirects into the app's own custom URL scheme instead (registered
// as an Android intent-filter / iOS CFBundleURLTypes entry in health-mobile) —
// confirmed directly against the Checkout Sessions API that Stripe accepts a
// non-http(s) scheme here, so this is a real working deep link, not a guess.
const APP_SCHEME = 'fullhealth://payment-return';

export type PaymentRedirectPlatform = 'web' | 'app';

export function buildBookingRedirectUrls(
  platform: PaymentRedirectPlatform,
  booking: { id: string; doctorId: string },
): { successUrl: string; cancelUrl: string } {
  if (platform === 'app') {
    return {
      successUrl: `${APP_SCHEME}?type=booking&success=1&bookingId=${booking.id}`,
      cancelUrl: `${APP_SCHEME}?type=booking&cancelled=1&bookingId=${booking.id}`,
    };
  }
  const baseUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3002';
  return {
    successUrl: `${baseUrl}/bookings?success=1&bookingId=${booking.id}`,
    cancelUrl: `${baseUrl}/doctors/${booking.doctorId}?cancelled=1`,
  };
}

export function buildMedicineOrderRedirectUrls(
  platform: PaymentRedirectPlatform,
  order: { id: string },
): { successUrl: string; cancelUrl: string } {
  if (platform === 'app') {
    return {
      successUrl: `${APP_SCHEME}?type=medicine_order&success=1&orderId=${order.id}`,
      cancelUrl: `${APP_SCHEME}?type=medicine_order&cancelled=1&orderId=${order.id}`,
    };
  }
  const baseUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3002';
  return {
    successUrl: `${baseUrl}/orders?success=1&orderId=${order.id}`,
    cancelUrl: `${baseUrl}/orders?cancelled=1&orderId=${order.id}`,
  };
}

// A single checkout can now cover several MedicineOrders at once — one per
// pharmacy/tenant in the cart (see MedicineOrderPaymentsService's
// createCheckoutForOrderGroup) — so the redirect needs to carry every
// order id, not just one.
export function buildMedicineOrderGroupRedirectUrls(
  platform: PaymentRedirectPlatform,
  orderIds: string[],
): { successUrl: string; cancelUrl: string } {
  const idsParam = orderIds.join(',');
  if (platform === 'app') {
    return {
      successUrl: `${APP_SCHEME}?type=medicine_order_group&success=1&orderIds=${idsParam}`,
      cancelUrl: `${APP_SCHEME}?type=medicine_order_group&cancelled=1&orderIds=${idsParam}`,
    };
  }
  const baseUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3002';
  return {
    successUrl: `${baseUrl}/orders?success=1&orderIds=${idsParam}`,
    cancelUrl: `${baseUrl}/orders?cancelled=1&orderIds=${idsParam}`,
  };
}
