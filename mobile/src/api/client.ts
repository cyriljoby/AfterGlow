import { Config } from "../constants/config";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${Config.apiBaseUrl}${path}`, {
    ...fetchOptions,
    headers,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return body as T;
}

export { request, ApiError };
