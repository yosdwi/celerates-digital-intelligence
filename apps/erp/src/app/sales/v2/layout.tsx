// Sales V2 only: Crisp component styles (namespaced crisp-* classes and --crisp-* tokens, inside @layer so the app's
// own unlayered styles still win). Crisp's base.css is deliberately not loaded; it would restyle every V1 page.
import "@crisp-ui-kit/crisp/styles.layered.css";
import "./sales-v2.css";
import { SalesCrispMessages } from "@/features/sales-v2/crisp-messages";

export default function SalesV2Layout({ children }: { children: React.ReactNode }) {
  return <SalesCrispMessages>{children}</SalesCrispMessages>;
}
