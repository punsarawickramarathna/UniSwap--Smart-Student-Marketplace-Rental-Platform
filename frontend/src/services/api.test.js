import { beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => {
  function createClient() {
    const client = vi.fn();
    client.post = vi.fn();
    client.interceptors = {
      request: {
        use: vi.fn((handler) => {
          client.requestInterceptor = handler;
        }),
      },
      response: {
        use: vi.fn((successHandler, errorHandler) => {
          client.responseSuccessInterceptor = successHandler;
          client.responseErrorInterceptor = errorHandler;
        }),
      },
    };
    return client;
  }

  return {
    apiClient: createClient(),
    refreshClient: createClient(),
  };
});

vi.mock("axios", () => ({
  default: {
    create: vi
      .fn()
      .mockReturnValueOnce(clients.apiClient)
      .mockReturnValueOnce(clients.refreshClient),
  },
}));

import api, {
  clearLocalAuthSession,
  refreshAccessToken,
  setAccessToken,
  setAuthInvalidatedHandler,
} from "./api";

function unauthorizedError(config = {}) {
  return {
    config: {
      headers: {},
      url: "/protected-resource",
      ...config,
    },
    response: { status: 401 },
  };
}

describe("central Axios auth client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clients.apiClient.mockReset();
    clients.refreshClient.post.mockReset();
    // A real login re-enables refresh; mirror that so tests remain isolated after
    // cases that intentionally mark the browser session as signed out.
    setAccessToken("test-reset-token");
    setAccessToken(null);
    setAuthInvalidatedHandler(null);
  });

  it("adds the CSRF header and in-memory Bearer token centrally", () => {
    setAccessToken("access-token");

    const config = clients.apiClient.requestInterceptor({ headers: {} });

    expect(config.headers["X-CSRF-Protection"]).toBe("1");
    expect(config.headers.Authorization).toBe("Bearer access-token");
  });

  it("shares one refresh across concurrent 401 responses and replays each request once", async () => {
    let resolveRefresh;
    clients.refreshClient.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    clients.apiClient.mockImplementation(async (config) => ({
      data: config.url,
    }));

    const firstError = unauthorizedError({ url: "/orders" });
    const secondError = unauthorizedError({ url: "/notifications" });

    const firstRetry = clients.apiClient.responseErrorInterceptor(firstError);
    const secondRetry = clients.apiClient.responseErrorInterceptor(secondError);

    expect(clients.refreshClient.post).toHaveBeenCalledOnce();

    resolveRefresh({
      data: {
        access_token: "refreshed-token",
        user: { id: "user-id", email: "student@campus.edu" },
      },
    });

    await expect(firstRetry).resolves.toEqual({ data: "/orders" });
    await expect(secondRetry).resolves.toEqual({ data: "/notifications" });

    expect(clients.apiClient).toHaveBeenCalledTimes(2);
    expect(firstError.config._authRetry).toBe(true);
    expect(secondError.config._authRetry).toBe(true);
    expect(firstError.config.headers.Authorization).toBe(
      "Bearer refreshed-token",
    );
    expect(secondError.config.headers.Authorization).toBe(
      "Bearer refreshed-token",
    );
  });

  it("does not retry a request that has already been retried", async () => {
    const error = unauthorizedError({ _authRetry: true });

    await expect(
      clients.apiClient.responseErrorInterceptor(error),
    ).rejects.toBe(error);
    expect(clients.refreshClient.post).not.toHaveBeenCalled();
  });

  it("does not try to refresh a public forgot-password request", async () => {
    const error = unauthorizedError({
      url: "/auth/forgot-password",
      skipAuthRefresh: true,
    });

    await expect(
      clients.apiClient.responseErrorInterceptor(error),
    ).rejects.toBe(error);
    expect(clients.refreshClient.post).not.toHaveBeenCalled();
  });

  it("does not try to refresh a public reset-password request", async () => {
    const error = unauthorizedError({
      url: "/auth/reset-password",
      skipAuthRefresh: true,
    });

    await expect(
      clients.apiClient.responseErrorInterceptor(error),
    ).rejects.toBe(error);
    expect(clients.refreshClient.post).not.toHaveBeenCalled();
  });

  it.each([
    "/auth/register",
    "/auth/verify-email",
    "/auth/resend-verification",
  ])("does not refresh public registration flow %s", async (url) => {
    const error = unauthorizedError({ url });
    await expect(clients.apiClient.responseErrorInterceptor(error)).rejects.toBe(error);
    expect(clients.refreshClient.post).not.toHaveBeenCalled();
  });

  it("does not turn an invalid login into a refresh attempt", async () => {
    const error = unauthorizedError({ url: "/auth/login" });

    await expect(
      clients.apiClient.responseErrorInterceptor(error),
    ).rejects.toBe(error);
    expect(clients.refreshClient.post).not.toHaveBeenCalled();
  });

  it("invalidates auth once when the shared refresh session is rejected", async () => {
    const onInvalidated = vi.fn();
    setAuthInvalidatedHandler(onInvalidated);
    setAccessToken("expired-token");
    const refreshError = { response: { status: 401 } };
    clients.refreshClient.post.mockRejectedValue(refreshError);

    const firstRetry = clients.apiClient.responseErrorInterceptor(
      unauthorizedError({ url: "/orders" }),
    );
    const secondRetry = clients.apiClient.responseErrorInterceptor(
      unauthorizedError({ url: "/notifications" }),
    );

    await expect(firstRetry).rejects.toBe(refreshError);
    await expect(secondRetry).rejects.toBe(refreshError);

    expect(clients.refreshClient.post).toHaveBeenCalledOnce();
    expect(onInvalidated).toHaveBeenCalledOnce();

    const requestAfterFailure = clients.apiClient.requestInterceptor({
      headers: {},
    });
    expect(requestAfterFailure.headers.Authorization).toBeUndefined();
  });

  it("does not let an in-flight refresh restore auth after local logout", async () => {
    let resolveRefresh;
    clients.refreshClient.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    setAccessToken("expired-token");

    const inFlightRefresh = refreshAccessToken();
    clearLocalAuthSession();

    resolveRefresh({
      data: {
        access_token: "must-not-be-restored",
        user: { id: "user-id", email: "student@campus.edu" },
      },
    });

    await expect(inFlightRefresh).rejects.toEqual(
      expect.objectContaining({ code: "auth_refresh_cancelled" }),
    );

    const requestAfterLogout = clients.apiClient.requestInterceptor({
      headers: {},
    });
    expect(requestAfterLogout.headers.Authorization).toBeUndefined();

    await expect(refreshAccessToken()).rejects.toEqual(
      expect.objectContaining({ code: "auth_refresh_cancelled" }),
    );
    expect(clients.refreshClient.post).toHaveBeenCalledOnce();
  });

  it("uses the cookie-enabled refresh client with the CSRF header", async () => {
    clients.refreshClient.post.mockResolvedValue({
      data: {
        access_token: "new-token",
        user: { id: "user-id", email: "student@campus.edu" },
      },
    });

    await refreshAccessToken();

    expect(clients.refreshClient.post).toHaveBeenCalledWith(
      "/auth/refresh",
      null,
      { headers: { "X-CSRF-Protection": "1" } },
    );
  });

  it("exports the configured API client as the single application client", () => {
    expect(api).toBe(clients.apiClient);
  });
});
