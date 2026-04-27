import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    getCurrentRevenueCatOffering,
    purchaseRevenueCatPackage,
    restoreRevenueCatPurchases
} from "../lib/subscriptions/revenueCat";

export default function PaywallScreen() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadOffering();
  }, []);

  async function loadOffering() {
    try {
      setLoading(true);

      const offering = await getCurrentRevenueCatOffering();
      setPackages(offering?.availablePackages ?? []);
    } catch (error) {
      console.log("Paywall offering load error:", error);
      Alert.alert("Subscription unavailable", "Could not load subscription options.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase(packageToPurchase: any) {
    try {
      setPurchasing(true);

      const isPremium = await purchaseRevenueCatPackage(packageToPurchase);

      if (isPremium) {
  Alert.alert("Subscription active", "Morning Message Premium is now active.", [
  { text: "Continue", onPress: () => router.replace("/(tabs)") },
]);
      } else {
        Alert.alert("Purchase complete", "Purchase finished, but Premium is not active yet.");
      }
    } catch (error: any) {
      if (error?.userCancelled) {
        return;
      }

      console.log("RevenueCat purchase error:", error);
      Alert.alert("Purchase failed", "Something went wrong while starting the purchase.");
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    try {
      setPurchasing(true);

      const isPremium = await restoreRevenueCatPurchases();

      if (isPremium) {
  Alert.alert("Restored", "Your Premium access has been restored.", [
  { text: "Continue", onPress: () => router.replace("/(tabs)") },
]);
      } else {
        Alert.alert("No subscription found", "No active Premium subscription was found.");
      }
    } catch (error) {
      console.log("RevenueCat restore error:", error);
      Alert.alert("Restore failed", "Could not restore purchases.");
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>

        <Text style={styles.title}>Morning Message Premium</Text>
        <Text style={styles.subtitle}>
          Start with full access during your free trial.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Premium includes</Text>
          <Text style={styles.bullet}>• Daily Morning Messages</Text>
          <Text style={styles.bullet}>• Prayers, goals, affirmations, and reminders</Text>
          <Text style={styles.bullet}>• AI writing help and title suggestions</Text>
          <Text style={styles.bullet}>• Reminder scheduling and archive history</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : packages.length === 0 ? (
          <Text style={styles.emptyText}>No subscription options are available.</Text>
        ) : (
          packages.map((pkg) => (
            <Pressable
              key={pkg.identifier}
              disabled={purchasing}
              onPress={() => handlePurchase(pkg)}
              style={({ pressed }) => [
                styles.packageButton,
                pressed && styles.packageButtonPressed,
                purchasing && styles.disabledButton,
              ]}
            >
              <View>
                <Text style={styles.packageTitle}>{pkg.product.title}</Text>
                <Text style={styles.packageSubtitle}>{pkg.product.identifier}</Text>
              </View>
              <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
            </Pressable>
          ))
        )}

        <Pressable
          disabled={purchasing}
          onPress={handleRestore}
          style={({ pressed }) => [
            styles.restoreButton,
            pressed && styles.restoreButtonPressed,
            purchasing && styles.disabledButton,
          ]}
        >
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </Pressable>

        <Text style={styles.footerText}>
          Testing now uses RevenueCat Test Store. Final app-store prices will be set in
          Google Play Console and App Store Connect.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#120f0b",
  },
  container: {
    padding: 22,
    paddingBottom: 36,
  },
  closeButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  closeText: {
    color: "#f5efe4",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    color: "#f5efe4",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "rgba(245,239,228,0.76)",
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "rgba(245,239,228,0.08)",
    borderColor: "rgba(245,239,228,0.16)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 22,
  },
  cardTitle: {
    color: "#f5efe4",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  bullet: {
    color: "rgba(245,239,228,0.8)",
    fontSize: 15,
    lineHeight: 24,
  },
  loading: {
    marginVertical: 20,
  },
  emptyText: {
    color: "rgba(245,239,228,0.72)",
    fontSize: 15,
    marginBottom: 16,
  },
  packageButton: {
    backgroundColor: "#f5efe4",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packageButtonPressed: {
    opacity: 0.88,
  },
  disabledButton: {
    opacity: 0.6,
  },
  packageTitle: {
    color: "#1f1710",
    fontSize: 17,
    fontWeight: "800",
  },
  packageSubtitle: {
    color: "rgba(31,23,16,0.58)",
    fontSize: 12,
    marginTop: 3,
  },
  packagePrice: {
    color: "#1f1710",
    fontSize: 16,
    fontWeight: "800",
  },
  restoreButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(245,239,228,0.32)",
    paddingVertical: 15,
    marginTop: 6,
  },
  restoreButtonPressed: {
    backgroundColor: "rgba(245,239,228,0.08)",
  },
  restoreText: {
    color: "#f5efe4",
    fontSize: 15,
    fontWeight: "700",
  },
  footerText: {
    color: "rgba(245,239,228,0.5)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    textAlign: "center",
  },
});