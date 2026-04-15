import { getTranslator, t as tFn } from "@/utils/i18n";

import { cartLineProductId } from "@/hooks/useCart";
import { formatIls, lineTotal } from "@/utils/cartMoney";
import { MENU_ITEMS } from "@/utils/menuData";
import { sortSaladsForDisplay } from "@/utils/saladDisplayOrder";

const MENU_CATEGORY_BY_PRODUCT_ID = new Map(
  MENU_ITEMS.map((row) => [row.id, row.category])
);

/**
 * קטגוריית מוצר לשורת עגלה — לפי מזהה מהתפריט הסטטי, ואז heuristics / menuCategory.
 * מונע סיווג שגוי של שתייה (למשל drink-xl) כמנה ראשית כשחסר menuCategory.
 */
function catalogCategoryForCartLine(item) {
  const pid = String(cartLineProductId(item) || "").trim();
  if (pid && MENU_CATEGORY_BY_PRODUCT_ID.has(pid)) {
    return MENU_CATEGORY_BY_PRODUCT_ID.get(pid);
  }
  const field = String(item?.menuCategory || "").trim().toLowerCase();
  if (field) return field;
  if (pid.startsWith("crispy-")) return "crispy";
  if (pid.startsWith("special-")) return "specials";
  if (
    pid.startsWith("burger-") ||
    pid.startsWith("kids-burger-") ||
    pid.startsWith("smash-burger-")
  ) {
    return "burgers";
  }
  return null;
}

function toppingsWaLabelKey(item) {
  const cat = catalogCategoryForCartLine(item);
  if (cat === "crispy") return "wa.toppingsCrispy";
  return "wa.toppings";
}

/** בורגר / קריספי — לפני צ'יפס, שתייה ושאר הקטגוריות בהודעת ווטסאפ */
function isMainMealCartLineForWa(item) {
  const c = catalogCategoryForCartLine(item);
  return c === "burgers" || c === "crispy" || c === "specials";
}

function partitionCartItemsForWa(items) {
  const list = Array.isArray(items) ? items : [];
  const mains = [];
  const others = [];
  for (const it of list) {
    (isMainMealCartLineForWa(it) ? mains : others).push(it);
  }
  return { mains, others };
}

/** בהודעה: כל שורות הקריספי (לפי סדר העגלה), ואז כל הבורגרים */
function sortMainMealsForWa(mains) {
  return [...mains]
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const ca = catalogCategoryForCartLine(a.item);
      const cb = catalogCategoryForCartLine(b.item);
      const rank = (c) =>
        c === "crispy" ? 0 : c === "burgers" ? 1 : c === "specials" ? 2 : 3;
      const ra = rank(ca);
      const rb = rank(cb);
      if (ra !== rb) return ra - rb;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
}

/** כותרת/תווית בווטסאפ — *מודגש* (לא כופלים אם כבר עטוף ב־*) */
function waBoldLabel(text) {
  const s = String(text ?? "").trim();
  if (!s) return s;
  if (/^\*[\s\S]*\*$/.test(s)) return s;
  return `*${s}*`;
}

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
  lines.push(waBoldLabel(tr("wa.newOrder")));
  if (orderNumber !== undefined && orderNumber !== null && `${orderNumber}`.trim()) {
    lines.push(`${waBoldLabel(tr("wa.orderNumber"))}: #${orderNumber}`);
  }
  lines.push("");
  lines.push(`${waBoldLabel(tr("wa.name"))}: ${customer.name}`);
  lines.push(`${waBoldLabel(tr("wa.phone"))}: ${customer.phone}`);
  if (customer.address) {
    lines.push(`${waBoldLabel(tr("wa.address"))}: ${customer.address}`);
  }
  lines.push(
    `${waBoldLabel(tr("wa.orderType"))}: ${
      customer.orderType === "pickup" ? tr("wa.pickup") : tr("wa.delivery")
    }`
  );
  if (customer.orderType === "delivery") {
    const z = customer.deliveryZone;
    if (z === "yarka") {
      lines.push(`${waBoldLabel(tr("wa.deliveryArea"))}: ${tr("wa.zoneYarka")}`);
    } else if (z === "outside") {
      lines.push(`${waBoldLabel(tr("wa.deliveryArea"))}: ${tr("wa.zoneOutside")}`);
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
        `${waBoldLabel(distLabel)}: ${Number(customer.deliveryDistanceKm).toFixed(1)} km`
      );
    }
    if (
      customer.deliveryFeeNis != null &&
      Number.isFinite(Number(customer.deliveryFeeNis))
    ) {
      lines.push(
        `${waBoldLabel(tr("wa.deliveryFee"))}: ₪${formatIls(Number(customer.deliveryFeeNis))}`
      );
    }
    if (customer.deliveryPayTo === "restaurant_all") {
      lines.push(waBoldLabel(tr("wa.payRestaurantInclDelivery")));
    } else if (customer.deliveryPayTo === "courier_delivery") {
      const mid =
        payment === "bit" || payment === "card"
          ? formatPaymentLabel(payment, locale)
          : formatPaymentLabel("card", locale);
      lines.push(
        waBoldLabel(
          `${tr("checkout.payCourierDeliveryFoodPrefix")}${mid}${tr("checkout.payCourierDeliveryFoodSuffix")}`
        )
      );
    } else if (customer.deliveryPayTo === "courier_all_cash") {
      lines.push(waBoldLabel(tr("wa.payCourierCashFull")));
    }
  }
  lines.push(
    `${waBoldLabel(tr("wa.payment"))}: ${formatPaymentLabel(payment, locale)}`
  );
  lines.push("");
  lines.push(`${waBoldLabel(tr("wa.details"))}:`);

  const { mains, others } = partitionCartItemsForWa(cart.items);
  const mainsOrdered = sortMainMealsForWa(mains);

  const pushWaCartLine = (item, displayIndex) => {
    const lineExtras = [item.sizeLabel, item.variantLabel]
      .filter(Boolean)
      .join(" · ");
    const lineSuffix = lineExtras ? ` — ${lineExtras}` : "";
    const qty = Number(item.quantity);
    const quantitySuffix =
      Number.isFinite(qty) && qty > 1 ? ` x${qty}` : "";
    lines.push(
      `*${displayIndex}. ${item.name}${quantitySuffix}*${lineSuffix}`
    );
    if (item.requestedDrinkLabel && String(item.requestedDrinkLabel).trim()) {
      const drinkPrice =
        Number.isFinite(Number(item.requestedDrinkPrice))
          ? ` (+₪${formatIls(Number(item.requestedDrinkPrice))})`
          : "";
      lines.push(
        `   ${waBoldLabel(tr("wa.drink"))}: ${String(item.requestedDrinkLabel).trim()}${drinkPrice}`
      );
    }
    if (item.salads?.length) {
      lines.push(
        `   ${waBoldLabel(tr("wa.salads"))}: ${sortSaladsForDisplay(item.salads)
          .map((x) => x.label)
          .join(", ")}`
      );
    }
    if (typeof item.bunSauceOnBun === "boolean") {
      lines.push(
        `   ${waBoldLabel(tr("wa.bunSauceOnBun"))}: ${item.bunSauceOnBun ? tr("ui.bunSauceYes") : tr("ui.bunSauceNo")}`
      );
    }
    if (item.burgerDoneness?.label) {
      lines.push(
        `   ${waBoldLabel(tr("wa.doneness"))}: ${String(item.burgerDoneness.label).trim()}`
      );
    }
    if (item.toppings?.length) {
      lines.push(
        `   ${waBoldLabel(tr(toppingsWaLabelKey(item)))}: ${item.toppings.map((x) => x.label).join(", ")}`
      );
    }
    if (item.extras?.length) {
      lines.push(
        `   ${waBoldLabel(tr("wa.sauces"))}: ${item.extras.map((x) => x.label).join(", ")}`
      );
    }
    if (item.sellerNotes && String(item.sellerNotes).trim()) {
      lines.push(
        `   ${waBoldLabel(tr("wa.sellerNotes"))}: ${String(item.sellerNotes).trim()}`
      );
    }
    lines.push(
      `   ${waBoldLabel(tr("wa.linePrice"))}: ₪${formatIls(lineTotal(item))}`
    );
  };

  let n = 0;
  for (const item of mainsOrdered) {
    n += 1;
    pushWaCartLine(item, n);
  }
  if (others.length > 0) {
    if (mainsOrdered.length > 0) {
      lines.push("");
      lines.push(waBoldLabel(tr("wa.nonMealItemsHeader")));
    }
    for (const item of others) {
      n += 1;
      pushWaCartLine(item, n);
    }
  }

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
    lines.push(
      `${waBoldLabel(tr("wa.foodSubtotal"))}: ₪${formatIls(foodSubtotal)}`
    );
    if (Number.isFinite(promoDiscount) && promoDiscount > 0) {
      lines.push(
        `${waBoldLabel(tr("wa.discount"))}: -₪${formatIls(promoDiscount)}`
      );
    }
    if (Number.isFinite(couponDiscount) && couponDiscount > 0) {
      lines.push(
        `${waBoldLabel(`${tr("wa.coupon")}${couponCode ? ` (${couponCode})` : ""}`)}: -₪${formatIls(couponDiscount)}`
      );
    }
    lines.push(
      `${waBoldLabel(tr("wa.deliveryFee"))}: ₪${formatIls(Number(customer.deliveryFeeNis))}`
    );
    lines.push(
      `${waBoldLabel(tr("wa.totalWithDelivery"))}: *₪${formatIls(total)}*`
    );
  } else {
    if (Number.isFinite(promoDiscount) && promoDiscount > 0) {
      lines.push(
        `${waBoldLabel(tr("wa.discount"))}: -₪${formatIls(promoDiscount)}`
      );
    }
    if (Number.isFinite(couponDiscount) && couponDiscount > 0) {
      lines.push(
        `${waBoldLabel(`${tr("wa.coupon")}${couponCode ? ` (${couponCode})` : ""}`)}: -₪${formatIls(couponDiscount)}`
      );
    }
    lines.push(
      `${waBoldLabel(tr("wa.total"))}: *₪${formatIls(total)}*`
    );
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
