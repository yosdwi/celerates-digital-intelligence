import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl({
  output: "standalone", devIndicators: false,
  // IMAP and MIME parsing for Sales email (lib/mail): plain Node packages, loaded at runtime rather than bundled.
  serverExternalPackages: ["imapflow", "mailparser"],
  // Served through Cloudflare Tunnel (TLS terminated at the edge, forwarded to this container
  // plain) -- Next's own Server Action origin check can't reliably derive the public origin from
  // request headers there, so every Server Action (upload evidence included) 403'd. Declare it.
  // Middleware sees a copy of every request body; above this size Next truncates the route's copy too, so it must
  // stay above the Server Action limit.
  experimental: { serverActions: { bodySizeLimit: "22mb", allowedOrigins: ["ierp.celeratesapps.com"] }, middlewareClientMaxBodySize: "25mb" },
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ] }]; },
});
