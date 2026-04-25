import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="compass-outline" size={64} color="#D1D5DB" />
      <Text style={styles.heading}>Explore</Text>
      <Text style={styles.subtext}>
        Discover public albums from{"\n"}verified humans.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
  },
  subtext: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
});
