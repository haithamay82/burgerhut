import { getTranslator, t as tFn } from "@/utils/i18n";

import { cartLineProductId } from "@/hooks/useCart";
import { formatIls, lineTotal, safeQty } from "@/utils/cartMoney";
import { MENU_ITEMS } from "@/utils/menuData";
import { formatCartLineSaladsForOrder } from "@/utils/saladDisplayOrder";
import { specialBurgerMenuDescription } from "@/utils/specialBurgerMealDescription";

const MENU_CATEGORY_BY_PRODUCT_ID = new Map(
  MENU_ITEMS.map((row) => [row.id, row.category])
);

/** שם לתצוגה בווטסאפ — בלי סיומת כמות בשם (למשל "… x3") כשמפריסים לשורות נפרדות. */
function waLineDisplayName(item) {
  const raw = String(item?.name ?? "").trim();
  const cleaned = raw.replace(/\s*[×x]\s*\d+$/iu, "").trim();
  return cleaned || raw || "—";
}

/** כמה שורות תצוגה לפריט (במקום שורה אחת עם x3 — כל יחידה בשורה נפרדת). */
function cartLineDisplayUnits(item) {
  let n = Math.floor(Number(item?.quantity));
  if (!Number.isFinite(n) || n < 1) {
    n = Math.floor(Number(item?.qty));
  }
  if (!Number.isFinite(n) || n < 1) {
    n = safeQty(item);
  }
  if (n <= 1) {
    const m = String(item?.name ?? "").match(/[×x]\s*(\d+)\s*$/iu);
    if (m) {
      const fromName = Math.floor(Number(m[1]));
      if (Number.isFinite(fromName) && fromName > 1) {
        n = Math.min(99, fromName);
      }
    }
  }
  return Math.min(99, Math.max(1, n));
}

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
 * @param {{ customer: object, cart: object, total: number, payment: string, locale?: 'he'|'ar' }} p
 */
export function buildWhatsAppOrderText({
  customer,
  cart,
  total,
  payment,
  locale = "he",
}) {
  const tr = getTranslator(locale);
  const lines = [];
  lines.push(tr("wa.brand"));
  lines.push(waBoldLabel(tr("wa.newOrder")));
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
    const villageName =
      locale === "ar"
        ? customer.deliveryVillageLabelAr || customer.deliveryVillageLabelHe
        : customer.deliveryVillageLabelHe || customer.deliveryVillageLabelAr;
    if (villageName) {
      lines.push(`${waBoldLabel(tr("wa.deliveryVillage"))}: ${villageName}`);
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
    if (customer.deliveryFeeAgreed) {
      lines.push(
        `${waBoldLabel(tr("wa.deliveryFee"))}: ${tr("wa.deliveryFeeAgreed")}`
      );
    } else if (
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
    } else if (customer.deliveryPayTo === "courier_agreed_cash") {
      lines.push(waBoldLabel(tr("wa.payCourierAgreed")));
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
    lines.push(
      `*${displayIndex}. ${waLineDisplayName(item)}*${lineSuffix}`
    );

    const waPid = String(cartLineProductId(item) || "").trim();
    const cat = catalogCategoryForCartLine(item);

    const pushSalads = () => {
      const saladsText = formatCartLineSaladsForOrder(item, tr);
      if (saladsText == null) return;
      lines.push(`   ${waBoldLabel(tr("wa.salads"))}: ${saladsText}`);
    };
    const pushSpecialMealBlocks = () => {
      const specialMealDesc = specialBurgerMenuDescription(
        locale,
        waPid,
        item.specialPattyGrams
      );
      if (specialMealDesc) {
        lines.push(
          `   ${waBoldLabel(tr("checkout.specialMealComponentsPrefix"))}: ${specialMealDesc}`
        );
      }
      if (waPid === "special-cheese-bomb") {
        lines.push(
          `   ${waBoldLabel(tr("wa.specialPatty"))}: ${tr("wa.cheeseBombPattyLine")}`
        );
      } else if (waPid.startsWith("special-")) {
        const g =
          waPid === "special-lettuce-burger"
            ? 160
            : Number(item.specialPattyGrams) === 220
              ? 220
              : 200;
        lines.push(
          `   ${waBoldLabel(tr("wa.specialPatty"))}: ${g}${tr("wa.gramsUnit")}`
        );
      }
    };
    const pushBunSauceOnBun = () => {
      if (typeof item.bunSauceOnBun === "boolean") {
        lines.push(
          `   ${waBoldLabel(tr("wa.bunSauceOnBun"))}: ${item.bunSauceOnBun ? tr("ui.bunSauceYes") : tr("ui.bunSauceNo")}`
        );
      }
    };
    const pushDoneness = () => {
      if (item.burgerDoneness?.label) {
        lines.push(
          `   ${waBoldLabel(tr("wa.doneness"))}: ${String(item.burgerDoneness.label).trim()}`
        );
      }
    };
    const pushToppings = () => {
      if (item.toppings?.length) {
        lines.push(
          `   ${waBoldLabel(tr(toppingsWaLabelKey(item)))}: ${item.toppings.map((x) => x.label).join(", ")}`
        );
      }
    };
    const pushExtras = () => {
      if (item.extras?.length) {
        lines.push(
          `   ${waBoldLabel(tr("wa.sauces"))}: ${item.extras.map((x) => x.label).join(", ")}`
        );
      }
    };
    const pushMealFries = () => {
      if (item.mealFriesLabel && String(item.mealFriesLabel).trim()) {
        const friesPrice =
          Number.isFinite(Number(item.mealFriesPrice))
            ? ` (+₪${formatIls(Number(item.mealFriesPrice))})`
            : "";
        lines.push(
          `   ${waBoldLabel(tr("wa.mealFries"))}: ${String(item.mealFriesLabel).trim()}${friesPrice}`
        );
      }
    };
    const pushDrink = () => {
      if (item.requestedDrinkLabel && String(item.requestedDrinkLabel).trim()) {
        const drinkPrice =
          Number.isFinite(Number(item.requestedDrinkPrice))
            ? ` (+₪${formatIls(Number(item.requestedDrinkPrice))})`
            : "";
        lines.push(
          `   ${waBoldLabel(tr("wa.drink"))}: ${String(item.requestedDrinkLabel).trim()}${drinkPrice}`
        );
      }
    };
    const pushSellerNotes = () => {
      if (item.sellerNotes && String(item.sellerNotes).trim()) {
        lines.push(
          `   ${waBoldLabel(tr("wa.sellerNotes"))}: ${String(item.sellerNotes).trim()}`
        );
      }
    };

    /** בורגר / קריספי — כמו סדר תצוגת האתר: סלטים → עשייה → תוספות → רטבים בצד → מטוגנים → שתייה → הערות (רוטב על לחמניה לפני עשייה כמו ב-checkout) */
    if (cat === "burgers" || cat === "crispy") {
      pushSalads();
      pushBunSauceOnBun();
      pushDoneness();
      pushToppings();
      pushExtras();
      pushMealFries();
      pushDrink();
      pushSellerNotes();
    } else {
      pushSalads();
      pushSpecialMealBlocks();
      pushBunSauceOnBun();
      pushDoneness();
      pushToppings();
      pushExtras();
      pushMealFries();
      pushDrink();
      pushSellerNotes();
    }

    lines.push(
      `   ${waBoldLabel(tr("wa.linePrice"))}: ₪${formatIls(
        lineTotal({ ...item, quantity: 1 })
      )}`
    );
  };

  let n = 0;
  for (const item of mainsOrdered) {
    const units = cartLineDisplayUnits(item);
    for (let u = 0; u < units; u++) {
      n += 1;
      pushWaCartLine(item, n);
    }
  }
  if (others.length > 0) {
    if (mainsOrdered.length > 0) {
      lines.push("");
      lines.push(waBoldLabel(tr("wa.nonMealItemsHeader")));
    }
    for (const item of others) {
      const units = cartLineDisplayUnits(item);
      for (let u = 0; u < units; u++) {
        n += 1;
        pushWaCartLine(item, n);
      }
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
        `${waBoldLabel(tr("wa.couponDiscountLabel"))}: ${formatIls(couponDiscount)} ${tr("wa.nisCurrencySuffix")}`
      );
      if (couponCode) {
        lines.push(
          `${waBoldLabel(tr("wa.couponCodeLabel"))}: ${couponCode}`
        );
      }
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
        `${waBoldLabel(tr("wa.couponDiscountLabel"))}: ${formatIls(couponDiscount)} ${tr("wa.nisCurrencySuffix")}`
      );
      if (couponCode) {
        lines.push(
          `${waBoldLabel(tr("wa.couponCodeLabel"))}: ${couponCode}`
        );
      }
    }
    if (customer.deliveryFeeAgreed) {
      lines.push(
        `${waBoldLabel(tr("wa.deliveryFee"))}: ${tr("wa.deliveryFeeAgreed")}`
      );
    }
    lines.push(
      `${waBoldLabel(tr("wa.total"))}: *₪${formatIls(total)}*`
    );
  }

  return lines.join("\n");
}

const ADMIN_PUSH_ORDER_ITEMS_MAX_CHARS = 3200;

/**
 * פריטי עגלה במספור 1, 2, … — אותו סדר ושורת כותרת כמו בווטסאפ (טקסט רגיל, בלי *).
 * לתוכן התראות ניהול / Push (לא מספר הזמנה של המערכת).
 * @param {unknown[]} items
 * @param {'he'|'ar'} [locale]
 * @param {{ maxChars?: number }} [opts]
 */
export function buildOrderItemsHeadlinesPlain(
  items,
  locale = "he",
  opts = {}
) {
  const maxRaw = Number(opts.maxChars);
  const maxChars =
    Number.isFinite(maxRaw) && maxRaw > 200
      ? Math.floor(maxRaw)
      : ADMIN_PUSH_ORDER_ITEMS_MAX_CHARS;
  const tr = getTranslator(locale === "ar" ? "ar" : "he");
  const list = Array.isArray(items) ? items : [];
  const { mains, others } = partitionCartItemsForWa(list);
  const mainsOrdered = sortMainMealsForWa(mains);
  const linesOut = [];
  const pushHeadline = (item, displayIndex) => {
    const lineExtras = [item.sizeLabel, item.variantLabel]
      .filter(Boolean)
      .join(" · ");
    const lineSuffix = lineExtras ? ` — ${lineExtras}` : "";
    const name = waLineDisplayName(item);
    linesOut.push(`${displayIndex}. ${name}${lineSuffix}`);
  };
  let n = 0;
  for (const item of mainsOrdered) {
    const units = cartLineDisplayUnits(item);
    for (let u = 0; u < units; u++) {
      n += 1;
      pushHeadline(item, n);
    }
  }
  if (others.length > 0) {
    if (mainsOrdered.length > 0) {
      const hdr = String(tr("wa.nonMealItemsHeader") || "")
        .replace(/\*/g, "")
        .trim();
      if (hdr) linesOut.push(hdr);
    }
    for (const item of others) {
      const units = cartLineDisplayUnits(item);
      for (let u = 0; u < units; u++) {
        n += 1;
        pushHeadline(item, n);
      }
    }
  }
  let text = linesOut.join("\n");
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 40))}\n…`;
  }
  return text;
}

/**
 * פריטי עגלה בסדר ובחלוקה כמו בווטסאפ (מנות ראשיות → כותרת תוספות → שאר), עם מספר תצוגה לכל פריט.
 * @param {unknown[]} items
 * @param {'he'|'ar'} [locale]
 * @returns {({ type: 'header'; label: string } | { type: 'item'; item: object; displayIndex: number })[]}
 */
export function getCartItemsInWhatsAppOrder(items, locale = "he") {
  const tr = getTranslator(locale === "ar" ? "ar" : "he");
  const list = Array.isArray(items) ? items : [];
  const { mains, others } = partitionCartItemsForWa(list);
  const mainsOrdered = sortMainMealsForWa(mains);
  /** @type {({ type: 'header'; label: string } | { type: 'item'; item: object; displayIndex: number })[]} */
  const out = [];
  let n = 0;
  for (const item of mainsOrdered) {
    const units = cartLineDisplayUnits(item);
    for (let u = 0; u < units; u++) {
      n += 1;
      out.push({
        type: "item",
        item: { ...item, quantity: 1 },
        displayIndex: n,
      });
    }
  }
  if (others.length > 0) {
    if (mainsOrdered.length > 0) {
      const label = String(tr("wa.nonMealItemsHeader") || "")
        .replace(/\*/g, "")
        .trim();
      out.push({ type: "header", label });
    }
    for (const item of others) {
      const units = cartLineDisplayUnits(item);
      for (let u = 0; u < units; u++) {
        n += 1;
        out.push({
          type: "item",
          item: { ...item, quantity: 1 },
          displayIndex: n,
        });
      }
    }
  }
  return out;
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
