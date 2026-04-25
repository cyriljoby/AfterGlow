import { request } from "./client";
import type { NonceResponse, AuthVerifyResponse, User } from "./types";

export function getNonce() {
  return request<NonceResponse>("/auth/nonce");
}

export function verifyProof(proof: Record<string, unknown>) {
  return request<AuthVerifyResponse>("/auth/verify", {
    method: "POST",
    body: JSON.stringify(proof),
  });
}

export function devLogin() {
  return request<AuthVerifyResponse>("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ dev: true }),
  });
}

export function getMe(token: string) {
  return request<User>("/auth/me", { token });
}

export function updateHandle(token: string, handle: string) {
  return request<User>("/auth/handle", {
    method: "PATCH",
    token,
    body: JSON.stringify({ handle }),
  });
}
