import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/contexts/AuthContext";

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={40} color="#7C3AED" />
      </View>

      <Text style={styles.handle}>@{user?.handle ?? "—"}</Text>
      <Text style={styles.userId}>ID: {user?.id?.slice(0, 8)}...</Text>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#EF4444" />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  handle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  userId: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 40,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  logoutText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "500",
  },
});
