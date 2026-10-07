// Sales V2 only: Crisp component styles (namespaced crisp-* classes and --crisp-* tokens, inside @layer so the app's
// own unlayered styles still win). Crisp's base.css is deliberately not loaded; it would restyle every V1 page.
import "@crisp-ui-kit/crisp/styles.layered.css";

export default function SalesV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}
