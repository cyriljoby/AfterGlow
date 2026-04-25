import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bloom</Text>
      <ActivityIndicator size="large" color="#7C3AED" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#7C3AED",
    marginBottom: 24,
  },
  spinner: {
    marginTop: 8,
  },
});
