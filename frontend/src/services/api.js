import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

const sharedClientConfig = {
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
  withCredentials: true,
};

const api = axios.create(sharedClientConfig);
const refreshClient = axios.create(sharedClientConfig);

let accessToken = null;
let refreshRequest = null;
let authInvalidatedHandler = null;
let authGeneration = 0;
let refreshAllowed = true;

function setHeader(headers, name, value) {
  if (typeof headers?.set === "function") {
    headers.set(name, value);
    return headers;
  }

  return {
    ...(headers ?? {}),
    [name]: value,
  };
}

function isRefreshExcludedRequest(config) {
  if (config?.skipAuthRefresh) {
    return true;
  }

  const requestUrl = config?.url ?? "";
  return [
    "/auth/login",
    "/auth/register",
    "/auth/verify-email",
    "/auth/resend-verification",
    "/auth/refresh",
    "/auth/logout",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].some((path) =>
    requestUrl.includes(path),
  );
}

function isTerminalRefreshFailure(error) {
  return error?.response?.status === 401 || error?.response?.status === 403;
}

function refreshCancelledError() {
  const error = new Error("Authentication refresh was cancelled.");
  error.code = "auth_refresh_cancelled";
  return error;
}

function invalidateAuthState() {
  clearLocalAuthSession();
  authInvalidatedHandler?.();
}

export function setAccessToken(token) {
  accessToken = token || null;
  if (accessToken) {
    refreshAllowed = true;
  }
}

export function clearLocalAuthSession() {
  accessToken = null;
  refreshAllowed = false;
  authGeneration += 1;
  // Detach callers from an older in-flight refresh. The request itself cannot
  // always be cancelled, so its generation is also checked before accepting it.
  refreshRequest = null;
}

export function setAuthInvalidatedHandler(handler) {
  authInvalidatedHandler = typeof handler === "function" ? handler : null;

  return () => {
    if (authInvalidatedHandler === handler) {
      authInvalidatedHandler = null;
    }
  };
}

export function refreshAccessToken() {
  if (!refreshAllowed) {
    return Promise.reject(refreshCancelledError());
  }

  if (!refreshRequest) {
    const requestGeneration = authGeneration;
    const currentRefreshRequest = refreshClient
      .post(
        "/auth/refresh",
        null,
        {
          headers: { "X-CSRF-Protection": "1" },
        },
      )
      .then((response) => {
        if (!refreshAllowed || requestGeneration !== authGeneration) {
          throw refreshCancelledError();
        }

        const session = response.data;
        setAccessToken(session.access_token);
        return session;
      })
      .catch((error) => {
        if (isTerminalRefreshFailure(error)) {
          invalidateAuthState();
        }
        throw error;
      })
      .finally(() => {
        if (refreshRequest === currentRefreshRequest) {
          refreshRequest = null;
        }
      });

    refreshRequest = currentRefreshRequest;
  }

  return refreshRequest;
}

api.interceptors.request.use((config) => {
  config.headers = setHeader(config.headers, "X-CSRF-Protection", "1");
  if (accessToken) {
    config.headers = setHeader(
      config.headers,
      "Authorization",
      `Bearer ${accessToken}`,
    );
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    if (
      error?.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._authRetry ||
      isRefreshExcludedRequest(originalRequest)
    ) {
      throw error;
    }

    originalRequest._authRetry = true;

    const session = await refreshAccessToken();
    originalRequest.headers = setHeader(
      originalRequest.headers,
      "Authorization",
      `Bearer ${session.access_token}`,
    );

    return api(originalRequest);
  },
);

export default api;
