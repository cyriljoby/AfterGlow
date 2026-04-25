import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import LoadingScreen from "../src/components/LoadingScreen";

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const segArr = segments as string[];
    const firstSegment = segArr[0];
    const secondSegment = segArr[1];
    const inAuthGroup = firstSegment === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && !user.handle && secondSegment !== "handle") {
      router.replace("/(auth)/handle");
    } else if (user && user.handle && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  if (isLoading) return <LoadingScreen />;

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
