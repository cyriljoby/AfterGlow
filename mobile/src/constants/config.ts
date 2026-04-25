const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export const Config = {
  apiBaseUrl: API_BASE_URL,
} as const;
