import { clerkMiddleware } from "@clerk/nextjs/server";
import type { OrganizationCustomRoleKey } from "@clerk/shared/types";
import { NextResponse } from "next/server";
import { decideRequest, type GateDecision } from "@/lib/frame-gate";
import { requestHasAdmin, adminAuthEnabled } from "@/lib/frame-admin";

async function gateResponse(req: Request, decision: GateDecision): Promise<NextResponse | null> {
  if (decision.kind === "allow") return null;
  if (decision.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  // admin_required
  if (!adminAuthEnabled()) {
    return NextResponse.json({ error: "admin_password_not_configured", hint: "run: sudo kiosk-ctl password <secret>" }, { status: 401 });
  }
  if (await requestHasAdmin(req.headers)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export default clerkMiddleware(async (auth, req) => {
  const gate = await gateResponse(req, decideRequest({
    host: req.headers.get("host") ?? "",
    method: req.method,
    path: req.nextUrl.pathname,
  }));
  if (gate) return gate;

  const path = req.nextUrl.pathname;
  // Console UI is human-facing: require a Clerk session (and admin role when
  // CONSOLE_ADMIN_ROLE is configured). Instance/device endpoints
  // (/api/sync/*, /api/active, /api/assets delivery) keep their own bearer /
  // x-admin-token gates so kiosks are never locked out here.
  if (path === "/console" || path.startsWith("/console/")) {
    const role = process.env.CONSOLE_ADMIN_ROLE;
    await auth.protect((has) => (role ? has({ role: role as OrganizationCustomRoleKey }) : true));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
