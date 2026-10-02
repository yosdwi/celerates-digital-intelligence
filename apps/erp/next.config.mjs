import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl({
  output: "standalone", devIndicators: false,
  // Served through Cloudflare Tunnel (TLS terminated at the edge, forwarded to this container
  // plain) -- Next's own Server Action origin check can't reliably derive the public origin from
  // request headers there, so every Server Action (upload evidence included) 403'd. Declare it.
  experimental: { serverActions: { bodySizeLimit: "22mb", allowedOrigins: ["ierp.celeratesapps.com"] } },
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ] }]; },
});
