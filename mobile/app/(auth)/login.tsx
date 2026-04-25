import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../src/contexts/AuthContext";
import { devLogin } from "../../src/api/auth";

export default function LoginScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleDevLogin = async () => {
    setLoading(true);
    try {
      const { token, user } = await devLogin();
      await login(token, user);
    } catch (e: any) {
      Alert.alert("Login failed", e.message ?? "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Bloom</Text>
        <Text style={styles.tagline}>
          Shared albums, ranked by AI,{"\n"}verified by humans.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={handleDevLogin}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Connecting..." : "Get Started"}
          </Text>
        </Pressable>

        <Text style={styles.hint}>
          Dev mode — connects without World ID
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingTop: 120,
    paddingBottom: 60,
  },
  hero: {
    alignItems: "center",
  },
  logo: {
    fontSize: 48,
    fontWeight: "800",
    color: "#7C3AED",
  },
  tagline: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 24,
  },
  actions: {
    alignItems: "center",
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#7C3AED",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: "#9CA3AF",
  },
});
