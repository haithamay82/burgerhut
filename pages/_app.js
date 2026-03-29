import "@/styles/globals.css";
import { CartProvider } from "@/hooks/useCart";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { InventoryProvider } from "@/contexts/InventoryContext";
import { OrderingHoursProvider } from "@/contexts/OrderingHoursContext";

export default function App({ Component, pageProps }) {
  return (
    <LocaleProvider>
      <OrderingHoursProvider>
        <CartProvider>
          <InventoryProvider>
            <Component {...pageProps} />
          </InventoryProvider>
        </CartProvider>
      </OrderingHoursProvider>
    </LocaleProvider>
  );
}

