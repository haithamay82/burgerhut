import { getTranslator, t as tFn } from "@/utils/i18n";

import { formatIls, lineTotal } from "@/utils/cartMoney";

/** @param {'he'|'ar'} locale */
export function formatPaymentLabel(payment, locale = "he") {
  return tFn(locale, `payment.${payment}`) || payment;
}

export function formatPaymentLabelHebrew(payment) {
  return tFn("he", `payment.${payment}`) || payment;
}

export function formatPaymentLabelArabic(payment) {
  return tFn("ar", `payment.${payment}`) || payment;
}

/**
 * @param {{ customer: object, cart: object, total: number, payment: string, orderNumber?: number|string, locale?: 'he'|'ar' }} p
 */
export function buildWhatsAppOrderText({
  customer,
  cart,
  total,
  payment,
  orderNumber,
  locale = "he",
}) {
  const tr = getTranslator(locale);
  const lines = [];
  lines.push(tr("wa.brand"));
  lines.push(tr("wa.newOrder"));
  if (orderNumber !== undefined && orderNumber !== null && `${orderNumber}`.trim()) {
    lines.push(`${tr("wa.orderNumber")}: #${orderNumber}`);
  }
  lines.push("");
  lines.push(`${tr("wa.name")}: ${customer.name}`);
  lines.push(`${tr("wa.phone")}: ${customer.phone}`);
  if (customer.address) {
    lines.push(`${tr("wa.address")}: ${customer.address}`);
  }
  lines.push(
    `${tr("wa.orderType")}: ${
      customer.orderType === "pickup" ? tr("wa.pickup") : tr("wa.delivery")
    }`
  );
  if (customer.orderType === "delivery") {
    const z = customer.deliveryZone;
    if (z === "yarka") {
      lines.push(`${tr("wa.deliveryArea")}: ${tr("wa.zoneYarka")}`);
    } else if (z === "outside") {
      lines.push(`${tr("wa.deliveryArea")}: ${tr("wa.zoneOutside")}`);
    }
    if (
      customer.deliveryDistanceKm != null &&
      Number.isFinite(Number(customer.deliveryDistanceKm))
    ) {
      const distLabel =
        customer.deliveryRouteMode === "driving"
          ? tr("wa.drivingDistance")
          : customer.deliveryRouteMode === "air_fallback"
            ? tr("wa.airDistance")
            : tr("wa.deliveryDistanceApprox");
      lines.push(
        `${distLabel}: ${Number(customer.deliveryDistanceKm).toFixed(1)} km`
      );
    }
    if (
      customer.deliveryFeeNis != null &&
      Number.isFinite(Number(customer.deliveryFeeNis))
    ) {
      lines.push(
        `${tr("wa.deliveryFee")}: ₪${formatIls(Number(customer.deliveryFeeNis))}`
      );
    }
    if (customer.deliveryPayTo === "restaurant_all") {
      lines.push(tr("wa.payRestaurantInclDelivery"));
    } else if (customer.deliveryPayTo === "courier_delivery") {
      const mid =
        payment === "bit" || payment === "card"
          ? formatPaymentLabel(payment, locale)
          : formatPaymentLabel("card", locale);
      lines.push(
        `${tr("checkout.payCourierDeliveryFoodPrefix")}${mid}${tr("checkout.payCourierDeliveryFoodSuffix")}`
      );
    } else if (customer.deliveryPayTo === "courier_all_cash") {
      lines.push(tr("wa.payCourierCashFull"));
    }
  }
  lines.push(`${tr("wa.payment")}: ${formatPaymentLabel(payment, locale)}`);
  lines.push("");
  lines.push(`${tr("wa.details")}:`);

  cart.items.forEach((item, index) => {
    const lineExtras = [item.sizeLabel, item.variantLabel]
      .filter(Boolean)
      .join(" · ");
    const lineSuffix = lineExtras ? ` — ${lineExtras}` : "";
    const qty = Number(item.quantity);
    const quantitySuffix =
      Number.isFinite(qty) && qty > 1 ? ` x${qty}` : "";
    lines.push(`${index + 1}. ${item.name}${quantitySuffix}${lineSuffix}`);
    if (item.requestedDrinkLabel && String(item.requestedDrinkLabel).trim()) {
      const drinkPrice =
        Number.isFinite(Number(item.requestedDrinkPrice))
          ? ` (+₪${formatIls(Number(item.requestedDrinkPrice))})`
          : "";
      lines.push(
        `   ${tr("wa.drink")}: ${String(item.requestedDrinkLabel).trim()}${drinkPrice}`
      );
    }
    if (item.salads?.length) {
      lines.push(
        `   ${tr("wa.salads")}: ${item.salads.map((x) => x.label).join(", ")}`
      );
    }
    if (item.toppings?.length) {
      lines.push(
        `   ${tr("wa.toppings")}: ${item.toppings.map((x) => x.label).join(", ")}`
      );
    }
    if (item.extras?.length) {
      lines.push(
        `   ${tr("wa.sauces")}: ${item.extras.map((x) => x.label).join(", ")}`
      );
    }
    if (item.sellerNotes && String(item.sellerNotes).trim()) {
      lines.push(`   ${tr("wa.sellerNotes")}: ${String(item.sellerNotes).trim()}`);
    }
    lines.push(
      `   ${tr("wa.linePrice")}: ₪${formatIls(lineTotal(item))}`
    );
  });

  lines.push("");
  const foodSubtotal = cart.items.reduce((s, item) => s + lineTotal(item), 0);
  const promoDiscount = Number(customer?.discountAmountNis);
  const couponDiscount = Number(customer?.couponDiscountNis);
  const couponCode = String(customer?.couponCode || "").trim().toUpperCase();
  if (
    customer.orderType === "delivery" &&
    customer.deliveryFeeNis != null &&
    Number.isFinite(Number(customer.deliveryFeeNis))
  ) {
    lines.push(`${tr("wa.foodSubtotal")}: ₪${formatIls(foodSubtotal)}`);
    if (Number.isFinite(promoDiscount) && promoDiscount > 0) {
      lines.push(`${tr("wa.discount")}: -₪${formatIls(promoDiscount)}`);
    }
    if (Number.isFinite(couponDiscount) && couponDiscount > 0) {
      lines.push(
        `${tr("wa.coupon")}${couponCode ? ` (${couponCode})` : ""}: -₪${formatIls(couponDiscount)}`
      );
    }
    lines.push(
      `${tr("wa.deliveryFee")}: ₪${formatIls(Number(customer.deliveryFeeNis))}`
    );
    lines.push(
      `${tr("wa.totalWithDelivery")}: *₪${formatIls(total)}*`
    );
  } else {
    if (Number.isFinite(promoDiscount) && promoDiscount > 0) {
      lines.push(`${tr("wa.discount")}: -₪${formatIls(promoDiscount)}`);
    }
    if (Number.isFinite(couponDiscount) && couponDiscount > 0) {
      lines.push(
        `${tr("wa.coupon")}${couponCode ? ` (${couponCode})` : ""}: -₪${formatIls(couponDiscount)}`
      );
    }
    lines.push(`${tr("wa.total")}: *₪${formatIls(total)}*`);
  }

  return lines.join("\n");
}

export function buildWhatsAppMessage(params) {
  return encodeURIComponent(buildWhatsAppOrderText(params));
}

export function buildWhatsAppUrl(params) {
  const locale = params.locale || "he";
  const message = buildWhatsAppMessage({ ...params, locale });
  const phone = "972504847599";
  return `https://wa.me/${phone}?text=${message}`;
}

/**
 * Open wa.me after async work (e.g. POST order). iOS Safari blocks `window.open`
 * when it is not in the same synchronous turn as the user tap — use full navigation.
 * @param {string} url
 * @returns {"same_tab" | "new_tab"} Use `same_tab` to skip client navigation (page is leaving).
 */
export function openWhatsAppComposeUrl(url) {
  if (typeof window === "undefined") return "new_tab";
  const ua = window.navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    window.location.assign(url);
    return "same_tab";
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup == null) {
    window.location.assign(url);
    return "same_tab";
  }
  return "new_tab";
}
