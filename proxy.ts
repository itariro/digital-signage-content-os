import { clerkMiddleware } from "@clerk/nextjs/server";
import type { OrganizationCustomRoleKey } from "@clerk/shared/types";
import { NextRequest, NextResponse } from "next/server";
import { decideRequest, isLocalDevBypass, type GateDecision } from "@/lib/frame-gate";
import { requestHasAdmin, adminAuthEnabled } from "@/lib/frame-admin";

async function gateResponse(req: NextRequest, decision: GateDecision): Promise<NextResponse | null> {
  if (decision.kind === "allow") return null;
  if (decision.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  // admin_required
  if (!adminAuthEnabled()) {
    const adminConfigured = Boolean(process.env.FRAME_ADMIN_HASH) || Boolean(process.env.FRAME_ADMIN_SECRET);
    if (!adminConfigured && isLocalDevBypass({ host: req.headers.get("host") ?? "", method: req.method, path: req.nextUrl.pathname })) return null;
    return NextResponse.json({ error: "admin_password_not_configured", hint: "run: sudo kiosk-ctl password <secret>" }, { status: 401 });
  }
  // Delegate the admin check to the node-runtime verify endpoint. The
  // middleware runs in the edge runtime, where FRAME_ADMIN_SECRET loaded from
  // frame.env by the kiosk service may not be visible; the verify route runs
  // in the node runtime and reads process.env directly.
  try {
    const verifyUrl = new URL('/api/admin/verify', req.url)
    const verifyRes = await fetch(verifyUrl, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    })
    if (verifyRes.ok) return null
    const body = await verifyRes.json().catch(() => ({ error: 'unauthorized' }))
    return NextResponse.json(body, { status: verifyRes.status })
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
}

async function handleRequest(req: NextRequest, auth?: any) {
  const gate = await gateResponse(req, decideRequest({
    host: req.headers.get("host") ?? "",
    method: req.method,
    path: req.nextUrl.pathname,
  }));
  if (gate) return gate;

  const path = req.nextUrl.pathname;
  // Console UI is human-facing: require a Clerk session (and admin role when
  // CONSOLE_ADMIN_ROLE is configured). Only enforced when Clerk is configured.
  if ((path === "/console" || path.startsWith("/console/")) && auth) {
    const role = process.env.CONSOLE_ADMIN_ROLE;
    await auth.protect((has: any) => (role ? has({ role: role as OrganizationCustomRoleKey }) : true));
  }
  return NextResponse.next();
}

const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default hasClerk
  ? clerkMiddleware(async (auth, req) => {
      const res = await handleRequest(req, auth);
      return res;
    })
  : async (req: NextRequest) => handleRequest(req);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};