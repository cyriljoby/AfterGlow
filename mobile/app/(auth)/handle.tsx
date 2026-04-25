import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../src/contexts/AuthContext";
import { updateHandle } from "../../src/api/auth";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export default function HandleScreen() {
  const { token, login } = useAuth();
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = HANDLE_RE.test(handle);

  const submit = async () => {
    if (!valid || !token) return;
    setLoading(true);
    try {
      const user = await updateHandle(token, handle);
      await login(token, user);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not set handle.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Pick a handle</Text>
        <Text style={styles.subtitle}>
          3-20 characters, lowercase letters, numbers, and underscores.
        </Text>

        <TextInput
          style={styles.input}
          value={handle}
          onChangeText={(t) => setHandle(t.toLowerCase())}
          placeholder="your_handle"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />

        <Pressable
          style={[styles.button, !valid && styles.buttonDisabled]}
          onPress={submit}
          disabled={!valid || loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Saving..." : "Continue"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: "#111827",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#7C3AED",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
