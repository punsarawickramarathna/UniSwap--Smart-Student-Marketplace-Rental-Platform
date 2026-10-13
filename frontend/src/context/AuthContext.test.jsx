import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ adapter: vi.fn() }));

// Run the real auth service and Axios interceptors against a recording transport.
vi.mock("axios", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    default: {
      ...original.default,
      create: (config) => original.default.create({ ...config, adapter: transport.adapter }),
    },
  };
});

import api, { clearLocalAuthSession, setAccessToken } from "../services/api";
import { AuthProvider, useAuth } from "./AuthContext";

function SessionProbe() {
  const { loading, user } = useAuth();
  return <p>{loading ? "Loading" : user?.email ?? "Signed out"}</p>;
}

function renderWithStrictMode() {
  render(<StrictMode><AuthProvider><SessionProbe /></AuthProvider></StrictMode>);
}

describe("browser session startup", () => {
  beforeEach(() => {
    transport.adapter.mockReset();
    clearLocalAuthSession();
    setAccessToken("enable-restoration-for-test");
    setAccessToken(null);
  });

  it("makes one successful signed-out request under Strict Mode", async () => {
    transport.adapter.mockImplementation(async (config) => ({
      config, status: 200, statusText: "OK", headers: {}, data: null,
    }));
    renderWithStrictMode();
    expect(await screen.findByText("Signed out")).toBeTruthy();
    expect(transport.adapter).toHaveBeenCalledOnce();
    const request = transport.adapter.mock.calls[0][0];
    expect(request.url).toBe("/auth/session");
    expect(request.withCredentials).toBe(true);
    expect(request.headers.get("X-CSRF-Protection")).toBe("1");
  });

  it("restores login once under Strict Mode and authenticates subsequent requests", async () => {
    const user = { id: "user", email: "student@campus.edu" };
    transport.adapter.mockImplementation(async (config) => ({
      config, status: 200, statusText: "OK", headers: {},
      data: config.url === "/auth/session" ? { access_token: "restored-token", user } : user,
    }));
    renderWithStrictMode();
    expect(await screen.findByText(user.email)).toBeTruthy();
    expect(transport.adapter).toHaveBeenCalledOnce();
    await api.get("/auth/me");
    expect(transport.adapter.mock.calls[1][0].headers.get("Authorization")).toBe("Bearer restored-token");
  });
});
