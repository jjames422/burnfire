import { NextResponse, type NextRequest } from "next/server";
import { portalOrigin } from "@/config/portal";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const portal = new URL(portalOrigin);
  const hostname = request.headers.get("host")?.split(":")[0].toLowerCase() ?? request.nextUrl.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const isPortalPath = /^\/(portal|academy|command|chat|auth)(\/|$)/.test(pathname);

  if (hostname === portal.hostname && pathname === "/") {
    return NextResponse.rewrite(new URL(`/portal${search}`, request.url));
  }
  if (process.env.PORTAL_DOMAIN_ENABLED === "true" && !isLocal && hostname !== portal.hostname && isPortalPath) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, portalOrigin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/portal/:path*", "/academy/:path*", "/command/:path*", "/chat/:path*", "/auth/:path*"],
};
