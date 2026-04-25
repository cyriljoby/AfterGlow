export interface User {
  id: string;
  nullifier_hash: string;
  handle: string | null;
  created_at: string;
}

export interface NonceResponse {
  rp_id: string;
  action: string;
  signature: string;
  nonce: string;
}

export interface AuthVerifyResponse {
  token: string;
  user: User;
}
