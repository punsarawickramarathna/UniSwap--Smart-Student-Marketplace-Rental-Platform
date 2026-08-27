import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "./services/auth";

vi.mock("./services/auth", () => ({
  forgotPassword: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
  register: vi.fn(),
  resendVerification: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
}));

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

async function openRoute(path) {
  window.history.replaceState(null, "", path);
  renderApp();
}

describe("UniSwap public and authentication experience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
    getCurrentUser.mockRejectedValue(new Error("No active session"));
    logout.mockResolvedValue(undefined);
  });

  it("renders the marketplace home page first with login and signup actions", async () => {
    renderApp();
    expect(await screen.findByText("Campus finds,")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /sign up/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /log in/i }).length).toBeGreaterThan(0);
  });

  it("validates ITBIN plus exactly eight digits before signup", async () => {
    await openRoute("/signup");
    fireEvent.change(screen.getByLabelText("Student ID"), { target: { value: "ITBIN123" } });
    fireEvent.change(screen.getByLabelText("University email"), { target: { value: "student@campus.edu" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Check your Student ID, university email, and password before continuing.",
    );
    expect(register).not.toHaveBeenCalled();
  });

  it("registers a valid student and transitions to email verification", async () => {
    register.mockResolvedValue({ message: "Account created.", student_id: "ITBIN12345678" });
    await openRoute("/signup");
    fireEvent.change(screen.getByLabelText("Student ID"), { target: { value: "itbin12345678" } });
    fireEvent.change(screen.getByLabelText("University email"), { target: { value: "student@campus.edu" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));

    expect(await screen.findByText("Check your university email.")).toBeTruthy();
    expect(window.location.pathname).toBe("/verify-email");
    expect(register).toHaveBeenCalledWith({
      studentId: "ITBIN12345678",
      email: "student@campus.edu",
      password: "Strong-password-123",
    });
  });

  it("verifies a six-digit code then redirects to Student ID login", async () => {
    verifyEmail.mockResolvedValue({ message: "verified" });
    await openRoute("/verify-email?studentId=ITBIN12345678");
    const first = screen.getByLabelText("Verification digit 1");
    fireEvent.paste(first, {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify university email" }));

    expect(await screen.findByLabelText("Student ID")).toHaveProperty("value", "ITBIN12345678");
    expect(screen.getByText(/University email verified successfully/)).toBeTruthy();
    expect(verifyEmail).toHaveBeenCalledWith({ studentId: "ITBIN12345678", code: "123456" });
  });

  it("logs in using Student ID and enters the protected dashboard", async () => {
    login.mockResolvedValue({
      access_token: "token",
      user: { id: "user", student_id: "ITBIN12345678", email: "student@campus.edu" },
    });
    await openRoute("/login");
    fireEvent.change(screen.getByLabelText("Student ID"), { target: { value: "ITBIN12345678" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));

    expect(await screen.findByText("You're signed in.")).toBeTruthy();
    expect(window.location.pathname).toBe("/dashboard");
    expect(login).toHaveBeenCalledWith({ studentId: "ITBIN12345678", password: "Strong-password-123" });
  });

  it("redirects a protected page to Student ID login after auth initialization", async () => {
    await openRoute("/notifications?filter=unread");
    expect(await screen.findByLabelText("Student ID")).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/notifications?filter=unread");
  });

  it("keeps forgot-password response non-enumerating", async () => {
    forgotPassword.mockResolvedValue({
      message: "If an eligible account exists for that email, password reset instructions will be sent shortly.",
    });
    await openRoute("/forgot-password");
    fireEvent.change(screen.getByLabelText("University email"), { target: { value: "student@campus.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));
    expect(await screen.findByText(/If an eligible account exists/)).toBeTruthy();
  });

  it("preserves reset-password flow", async () => {
    resetPassword.mockResolvedValue({ message: "Your password has been reset. Sign in with your new password." });
    await openRoute("/reset-password?token=secure-token");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New-strong-password-456" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "New-strong-password-456" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByLabelText("Student ID")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });
});
