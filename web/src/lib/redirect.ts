/**
 * Build an absolute URL for NextResponse.redirect that respects the public
 * proxy host (e.g., seo-forge-production.up.railway.app) instead of the
 * service's internal bind address (e.g., 0.0.0.0:8080).
 *
 * Behind Railway / any reverse proxy, `req.url` reports the internal URL,
 * which produces unreachable redirect Locations. We prefer x-forwarded-host
 * + x-forwarded-proto (set by all real proxies), then fall back to the host
 * header, then to req.url as a last resort.
 */
export function publicUrl(req: Request, pathname: string, search?: string): URL {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? req.headers.get("host");

  let base: URL;
  if (host) {
    const proto = forwardedProto ?? "https";
    base = new URL(`${proto}://${host}`);
  } else {
    base = new URL(req.url);
  }
  base.pathname = pathname;
  base.search = search ?? "";
  return base;
}
