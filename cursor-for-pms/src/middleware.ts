import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/", "/blog(.*)", "/billing", "/.well-known(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return;
  }
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
