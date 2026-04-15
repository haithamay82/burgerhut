export const CATEGORIES = [
  { id: "burgers" },
  { id: "specials" },
  { id: "crispy" },
  { id: "sides" },
  { id: "drinks" },
];

/**
 * דף הבית: טאב «מיוחדים» — כבוי זמנית כדי שלא יזמינו בזמן עבודה על המערכת.
 * להחזיר ל־true כשמוכנים להציג שוב.
 */
export const SHOW_SPECIALS_IN_HOME_MENU = true;

/** סלטים בחינם — לכל מנה */
export const FREE_SALADS = [
  { id: "salad_lettuce", image: "/menu/salad-lettuce.png" },
  { id: "salad_tomato", image: "/menu/salad-tomato.png" },
  { id: "salad_pickles", image: "/menu/salad-pickles.png" },
  { id: "salad_onion", image: "/menu/salad-onion.png" },
];

/** סלטים במנת קריספי — אותם חינמיים + קולסלאו בתשלום */
export const CRISPY_MEAL_SALADS = [
  ...FREE_SALADS,
  { id: "salad_coleslaw", image: "/menu/salad-coleslaw.png", price: 5 },
];

/** רשימת סלטים לוויזארד מנה לפי קטגוריה */
export function mealSaladChoicesForCategory(category) {
  return category === "crispy" ? CRISPY_MEAL_SALADS : FREE_SALADS;
}

/** סלטים שניתן לסמן כלא זמינים במלאי (כרגע קולסלאו במנת קריספי) */
export const INVENTORY_MANAGED_SALAD_IDS = new Set(["salad_coleslaw"]);

/** תוספות לבורגר / לעוף (לפי התפריט המודפס) */
export const BURGER_TOPPINGS = [
  { id: "cheddar", price: 5, image: "/menu/topping-cheddar.png" },
  { id: "gouda", price: 5, image: "/menu/topping-gouda.png" },
  { id: "fried_egg", price: 5, image: "/menu/topping-fried-egg.png" },
  { id: "jalapeno", price: 5, image: "/menu/topping-jalapeno.png" },
  { id: "caramel_mushrooms", price: 5, image: "/menu/topping-caramel-mushrooms.png" },
  { id: "caramel_onion", price: 5, image: "/menu/topping-caramel-onion.png" },
  { id: "lamb_bacon", price: 10, image: "/menu/topping-lamb-bacon.png" },
  { id: "veal_corned", price: 10, image: "/menu/topping-veal-corned.png" },
  { id: "pulled_asado", price: 15, image: "/menu/topping-pulled-asado.png" },
];

/** גבינות שניתן לבחור פעמיים (דבל) במנה אחת */
export const DOUBLE_CHEESE_TOPPING_IDS = new Set(["cheddar", "gouda"]);

/** תוספות שלא מוצעות במנות קריספי (ביצת עין, בייקון טלה, קורנדביף עגל, אסאדו מפורק) */
const CRISPY_EXCLUDED_TOPPING_IDS = new Set([
  "fried_egg",
  "lamb_bacon",
  "veal_corned",
  "pulled_asado",
]);

/** תוספות לבורגר המוצגות גם במנות קריספי צ'יקן */
export const CRISPY_MEAL_TOPPINGS = BURGER_TOPPINGS.filter(
  (row) => !CRISPY_EXCLUDED_TOPPING_IDS.has(row.id)
);

/** מידת עשייה לבשר — רק לבורגרים (לא קריספי) */
export const BURGER_DONENESS_OPTIONS = [
  { id: "rare" },
  { id: "medium" },
  { id: "medium_well" },
  { id: "well_done" },
];

export const DEFAULT_BURGER_DONENESS_ID = "medium_well";

/** בורגר קריספי מבוגרים — אופציית «בלי» בלבד */
export const CRISPY_CHICKEN_BURGER_PRODUCT_ID = "crispy-chicken-burger";

/** מזהה מנת ילדים — בחירת עגולה / טורטיה / בלי */
export const CRISPY_CHICKEN_KIDS_PRODUCT_ID = "crispy-chicken-burger-kids";

export const KIDS_CRISPY_BREAD_CHOICES = [
  { id: "round" },
  { id: "small_tortilla" },
  { id: "none" },
];

/** תוספות רטבים (מחיר בפועל ב-computeSaucesCharge) */
export const EXTRA_SAUCES = [
  { id: "sauce_house_regular", image: "/menu/sauce-house-regular.png" },
  { id: "sauce_house_spicy", image: "/menu/sauce-house-spicy.png" },
  { id: "sauce_bbq", image: "/menu/sauce-bbq.png" },
  { id: "sauce_sweet_chili", image: "/menu/sauce-sweet-chili.png" },
  { id: "sauce_hot_chili", image: "/menu/sauce-hot-chili.png" },
  { id: "sauce_garlic", image: "/menu/sauce-garlic.png" },
  { id: "sauce_cheddar", image: "/menu/sauce-cheddar.png" },
];

const IMG_BURGER =
  "https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=800";
const IMG_BURGER2 =
  "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=800";
const IMG_SMASH_240 = "/menu/smash-burger-240.png";
const IMG_SMASH_360 = "/menu/smash-burger-360.png";
const IMG_KIDS_BURGER_120 = "/menu/kids-burger-120.png";
const IMG_BURGER_160 = "/menu/burger-160.png";
const IMG_BURGER_200 = "/menu/burger-200.png";
const IMG_BURGER_220 = "/menu/burger-220.png";
const IMG_BURGER_320 = "/menu/burger-320.png";
/** תמונה משותפת לבורגר כפול 360ג׳ / 400ג׳ */
const IMG_BURGER_DOUBLE_LARGE = "/menu/burger-double-large.png";
const IMG_BURGER_440 = "/menu/burger-440.png";
const IMG_BURGER_480 = "/menu/burger-480.png";
const IMG_BURGER_520 = "/menu/burger-520.png";
const IMG_BURGER_560 = "/menu/burger-560.png";
const IMG_BURGER_600 = "/menu/burger-600.png";
const IMG_CHICKEN =
  "https://images.pexels.com/photos/1639559/pexels-photo-1639559.jpeg?auto=compress&cs=tinysrgb&w=800";
const IMG_CRISPY_CHICKEN_BURGER_ADULT = "/menu/crispy-chicken-burger.png";
const IMG_CRISPY_CHICKEN_BURGER_KIDS = "/menu/crispy-chicken-burger-kids.png";
const IMG_ONION =
  "https://images.pexels.com/photos/4109134/pexels-photo-4109134.jpeg?auto=compress&cs=tinysrgb&w=800";
const IMG_DRINK =
  "https://images.pexels.com/photos/7255352/pexels-photo-7255352.jpeg?auto=compress&cs=tinysrgb&w=800";
const IMG_DRINK_COLA = "/menu/drink-cola-can.png";
const IMG_DRINK_ZERO = "/menu/drink-zero.png";
const IMG_DRINK_SPRITE = "/menu/drink-sprite.png";
const IMG_DRINK_FANTA = "/menu/drink-fanta.png";
const IMG_DRINK_TAPUZINA_GRAPE = "/menu/drink-tapuzina-grape.png";
const IMG_DRINK_STRAWBERRY_BANANA = "/menu/drink-strawberry-banana.png";
const IMG_DRINK_SODA = "/menu/drink-soda.png";
const IMG_DRINK_WATER_SMALL = "/menu/drink-water-small.png";
const IMG_DRINK_COLA_15L = "/menu/drink-cola-15l.png";
const IMG_DRINK_ZERO_15L = "/menu/drink-zero-15l.png";
const IMG_DRINK_XL = "/menu/drink-xl.png";
const IMG_DRINK_XL_TEN = "/menu/drink-xl-ten.png";
const IMG_DRINK_FRESH_STRAWBERRY = "/menu/drink-fresh-strawberry.png";
const IMG_SIDE_MIX = "/menu/side-mix.png";
const IMG_SIDE_FRIES = "/menu/side-fries.png";
const IMG_SIDE_SWEET_POTATO = "/menu/side-sweet-potato.png";
const IMG_SIDE_ONION_RINGS = "/menu/side-onion-rings.png";
const IMG_SIDE_MASHED_BALLS = "/menu/side-mashed-balls.png";
const IMG_SIDE_CHIPS_CHEDDAR_SYMPHONY =
  "/menu/side-chips-cheddar-symphony.png";
const IMG_SIDE_MOZZARELLA_STICKS = "/menu/side-mozzarella-sticks.png";
const IMG_SIDE_HOME_FRIES = "/menu/side-home-fries.png";
const IMG_SIDE_HOME_FRIES_SPICY = "/menu/side-home-fries-spicy.png";
/** עד עדכון תמונות — placeholder אחיד */
const IMG_SPECIAL_BURGER_PLACEHOLDER = "/menu/burger-200.png";
const IMG_SPECIAL_TRUFFLE_KING = "/menu/special-truffle-king.png";
const IMG_SPECIAL_BBQ_SMOKE = "/menu/special-bbq-smoke.png";
const IMG_SPECIAL_FIRE_BURGER = "/menu/special-fire-burger.png";
const IMG_SPECIAL_CHEESE_BOMB = "/menu/special-cheese-bomb.png";
const IMG_SPECIAL_LAMB_BACON_DELUXE = "/menu/special-lamb-bacon-deluxe.png";
const IMG_SPECIAL_CORNED_BEEF_STACK = "/menu/special-corned-beef-stack.png";

export const MENU_ITEMS = [
  {
    id: "kids-burger-120",
    basePrice: 45,
    category: "burgers",
    image: IMG_KIDS_BURGER_120,
  },
  {
    id: "burger-160",
    basePrice: 50,
    category: "burgers",
    image: IMG_BURGER_160,
  },
  {
    id: "burger-200",
    basePrice: 58,
    category: "burgers",
    image: IMG_BURGER_200,
  },
  {
    id: "burger-220",
    basePrice: 65,
    category: "burgers",
    image: IMG_BURGER_220,
  },
  {
    id: "smash-burger-240",
    basePrice: 68,
    category: "burgers",
    image: IMG_SMASH_240,
  },
  {
    id: "smash-burger-360",
    basePrice: 82,
    category: "burgers",
    image: IMG_SMASH_360,
  },
  {
    id: "burger-320",
    basePrice: 70,
    category: "burgers",
    image: IMG_BURGER_320,
  },
  {
    id: "burger-360",
    basePrice: 75,
    category: "burgers",
    image: IMG_BURGER_DOUBLE_LARGE,
  },
  {
    id: "burger-400",
    basePrice: 80,
    category: "burgers",
    image: IMG_BURGER_DOUBLE_LARGE,
  },
  {
    id: "burger-440",
    basePrice: 85,
    category: "burgers",
    image: IMG_BURGER_440,
  },
  {
    id: "burger-480",
    basePrice: 90,
    category: "burgers",
    image: IMG_BURGER_480,
  },
  {
    id: "burger-520",
    basePrice: 95,
    category: "burgers",
    image: IMG_BURGER_520,
  },
  {
    id: "burger-560",
    basePrice: 108,
    category: "burgers",
    image: IMG_BURGER_560,
  },
  {
    id: "burger-600",
    basePrice: 114,
    category: "burgers",
    image: IMG_BURGER_600,
  },
  {
    id: "special-truffle-king",
    basePrice: 75,
    category: "specials",
    image: IMG_SPECIAL_TRUFFLE_KING,
  },
  {
    id: "special-bbq-smoke",
    basePrice: 85,
    category: "specials",
    image: IMG_SPECIAL_BBQ_SMOKE,
  },
  {
    id: "special-fire-burger",
    basePrice: 80,
    category: "specials",
    image: IMG_SPECIAL_FIRE_BURGER,
  },
  {
    id: "special-cheese-bomb",
    basePrice: 85,
    category: "specials",
    image: IMG_SPECIAL_CHEESE_BOMB,
  },
  {
    id: "special-lamb-bacon-deluxe",
    basePrice: 85,
    category: "specials",
    image: IMG_SPECIAL_LAMB_BACON_DELUXE,
  },
  {
    id: "special-corned-beef-stack",
    basePrice: 80,
    category: "specials",
    image: IMG_SPECIAL_CORNED_BEEF_STACK,
  },
  {
    id: "crispy-chicken-burger",
    basePrice: 45,
    category: "crispy",
    image: IMG_CRISPY_CHICKEN_BURGER_ADULT,
  },
  {
    id: "crispy-chicken-burger-kids",
    basePrice: 40,
    category: "crispy",
    image: IMG_CRISPY_CHICKEN_BURGER_KIDS,
  },
  {
    id: "crispy-chicken-tortilla-large",
    basePrice: 50,
    category: "crispy",
    image: IMG_CRISPY_CHICKEN_BURGER_KIDS,
  },
  {
    id: "side-fries",
    basePrice: 12,
    category: "sides",
    image: IMG_SIDE_FRIES,
  },
  {
    id: "side-sweet-potato",
    basePrice: 15,
    category: "sides",
    image: IMG_SIDE_SWEET_POTATO,
  },
  {
    id: "side-onion-rings",
    basePrice: 15,
    category: "sides",
    image: IMG_SIDE_ONION_RINGS,
  },
  {
    id: "side-mashed-balls",
    basePrice: 15,
    category: "sides",
    image: IMG_SIDE_MASHED_BALLS,
  },
  {
    id: "side-mix",
    basePrice: 15,
    category: "sides",
    image: IMG_SIDE_MIX,
  },
  {
    id: "side-chips-cheddar-symphony",
    basePrice: 25,
    category: "sides",
    image: IMG_SIDE_CHIPS_CHEDDAR_SYMPHONY,
  },
  {
    id: "side-mozzarella-sticks",
    basePrice: 25,
    category: "sides",
    image: IMG_SIDE_MOZZARELLA_STICKS,
  },
  {
    id: "side-home-fries",
    basePrice: 30,
    category: "sides",
    image: IMG_SIDE_HOME_FRIES,
  },
  {
    id: "side-home-fries-spicy",
    basePrice: 30,
    category: "sides",
    image: IMG_SIDE_HOME_FRIES_SPICY,
  },
  {
    id: "drink-cola",
    basePrice: 8,
    category: "drinks",
    image: IMG_DRINK_COLA,
  },
  {
    id: "drink-zero",
    basePrice: 8,
    category: "drinks",
    image: IMG_DRINK_ZERO,
  },
  {
    id: "drink-sprite",
    basePrice: 8,
    category: "drinks",
    image: IMG_DRINK_SPRITE,
  },
  {
    id: "drink-fanta",
    basePrice: 8,
    category: "drinks",
    image: IMG_DRINK_FANTA,
  },
  {
    id: "drink-tapuzina-grape",
    basePrice: 8,
    category: "drinks",
    image: IMG_DRINK_TAPUZINA_GRAPE,
  },
  {
    id: "drink-strawberry-banana",
    basePrice: 8,
    category: "drinks",
    image: IMG_DRINK_STRAWBERRY_BANANA,
  },
  {
    id: "drink-xl",
    basePrice: 1, // זמני — להחזיר ל־6
    category: "drinks",
    image: IMG_DRINK_XL,
  },
  {
    id: "drink-xl-ten",
    basePrice: 6,
    category: "drinks",
    image: IMG_DRINK_XL_TEN,
  },
  {
    id: "drink-soda",
    basePrice: 6,
    category: "drinks",
    image: IMG_DRINK_SODA,
  },
  {
    id: "drink-water-small",
    basePrice: 6,
    category: "drinks",
    image: IMG_DRINK_WATER_SMALL,
  },
  {
    id: "drink-fresh-strawberry",
    basePrice: 6,
    category: "drinks",
    image: IMG_DRINK_FRESH_STRAWBERRY,
  },
  {
    id: "drink-cola-15l",
    basePrice: 14,
    category: "drinks",
    image: IMG_DRINK_COLA_15L,
  },
  {
    id: "drink-zero-15l",
    basePrice: 14,
    category: "drinks",
    image: IMG_DRINK_ZERO_15L,
  },
];

/** מנות עיקריות (בורגרים + קריספי) לניהול מלאי */
const MAIN_MEAL_CATEGORIES = new Set(["burgers", "crispy", "specials"]);

export const MAIN_MENU_ITEMS = MENU_ITEMS.filter((row) =>
  MAIN_MEAL_CATEGORIES.has(row.category)
);

export const MAIN_MENU_PRODUCT_IDS = new Set(
  MAIN_MENU_ITEMS.map((row) => row.id)
);

/** תוספות בורגר (לניהול מלאי) */
export const BURGER_TOPPING_IDS = new Set(BURGER_TOPPINGS.map((r) => r.id));

/** כל מה שניתן לסמן כלא זמין במלאי */
export const MANAGED_INVENTORY_IDS = new Set([
  ...MAIN_MENU_PRODUCT_IDS,
  ...BURGER_TOPPING_IDS,
  ...INVENTORY_MANAGED_SALAD_IDS,
]);
