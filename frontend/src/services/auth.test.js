import { beforeEach, describe, expect, it, vi } from "vitest";

import api, { refreshAccessToken } from "./api";
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  refreshSession,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "./auth";

vi.mock("./api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  refreshAccessToken: vi.fn(),
}));

describe("auth service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends Student ID login using the backend field contract", async () => {
    api.post.mockResolvedValue({ data: { access_token: "token" } });
    await login({ studentId: "ITBIN12345678", password: "password" });
    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      student_id: "ITBIN12345678",
      password: "password",
    });
  });

  it("keeps legacy email login compatibility", async () => {
    api.post.mockResolvedValue({ data: { access_token: "token" } });
    await login({ email: "student@campus.edu", password: "password" });
    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      email: "student@campus.edu",
      password: "password",
    });
  });

  it("submits registration as a public request", async () => {
    api.post.mockResolvedValue({ data: { student_id: "ITBIN12345678" } });
    await register({ studentId: "ITBIN12345678", email: "student@campus.edu", password: "password" });
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      { student_id: "ITBIN12345678", email: "student@campus.edu", password: "password" },
      { skipAuthRefresh: true },
    );
  });

  it("submits verification and resend as public requests", async () => {
    api.post.mockResolvedValue({ data: { message: "ok" } });
    await verifyEmail({ studentId: "ITBIN12345678", code: "123456" });
    expect(api.post).toHaveBeenCalledWith(
      "/auth/verify-email",
      { student_id: "ITBIN12345678", code: "123456" },
      { skipAuthRefresh: true },
    );
    await resendVerification("ITBIN12345678");
    expect(api.post).toHaveBeenCalledWith(
      "/auth/resend-verification",
      { student_id: "ITBIN12345678" },
      { skipAuthRefresh: true },
    );
  });

  it("loads identity, refreshes, and logs out through centralized clients", async () => {
    api.get.mockResolvedValue({ data: { id: "user" } });
    refreshAccessToken.mockResolvedValue({ access_token: "refreshed" });
    api.post.mockResolvedValue({ status: 204 });
    await expect(getCurrentUser()).resolves.toEqual({ id: "user" });
    await expect(refreshSession()).resolves.toEqual({ access_token: "refreshed" });
    await logout();
    expect(api.post).toHaveBeenCalledWith("/auth/logout", null, { skipAuthRefresh: true });
  });

  it("keeps forgot and reset password public", async () => {
    api.post.mockResolvedValue({ data: { message: "ok" } });
    await forgotPassword("student@campus.edu");
    expect(api.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "student@campus.edu" }, { skipAuthRefresh: true });
    await resetPassword({ token: "token", newPassword: "New-password-123" });
    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", { token: "token", new_password: "New-password-123" }, { skipAuthRefresh: true });
  });
});
