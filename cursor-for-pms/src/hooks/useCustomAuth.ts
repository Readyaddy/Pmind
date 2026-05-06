import { useAuth as useClerkAuth } from "@clerk/nextjs";

export function useCustomAuth() {
  const auth = useClerkAuth();
  
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return { ...auth, userId: "dev_user_123", isLoaded: true, isSignedIn: true };
  }
  
  return auth;
}
