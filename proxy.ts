import { clerkMiddleware } from "@clerk/nextjs/server";
import type { OrganizationCustomRoleKey } from "@clerk/shared/types";

export default clerkMiddleware(async (auth, req) => {
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
