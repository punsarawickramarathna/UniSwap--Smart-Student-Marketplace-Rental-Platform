import axios from "axios";

import api, { refreshAccessToken } from "./api";

const SAFE_LOGIN_MESSAGES = {
  email_verification_required: "Verify your university email before signing in.",
  invalid_credentials: "Invalid Student ID or password.",
  too_many_login_attempts: "Too many attempts. Please try again shortly.",
  validation_error: "Check your Student ID and password, then try again.",
};

export class LoginError extends Error {
  constructor(code) {
    super(SAFE_LOGIN_MESSAGES[code] ?? "Unable to sign in. Please try again.");
    this.name = "LoginError";
    this.code = code;
  }
}

export async function login(credentials) {
  const payload = credentials.studentId
    ? { student_id: credentials.studentId, password: credentials.password }
    : { email: credentials.email, password: credentials.password };
  try {
    const response = await api.post("/auth/login", payload);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new LoginError(error.response?.data?.error?.code);
    }
    throw new LoginError("unexpected_error");
  }
}

const SAFE_REGISTRATION_MESSAGES = {
  account_already_exists: "An account with these student details already exists.",
  student_email_domain_not_allowed: "Use an approved university email address.",
  password_policy_failed: "Use a password between 12 and 128 characters.",
  validation_error: "Check your Student ID, university email, and password.",
};

export class RegistrationError extends Error {
  constructor(code) {
    super(SAFE_REGISTRATION_MESSAGES[code] ?? "Unable to create your account right now. Please try again.");
    this.name = "RegistrationError";
    this.code = code;
  }
}

export async function register({ studentId, email, password }) {
  try {
    const response = await api.post(
      "/auth/register",
      { student_id: studentId, email, password },
      { skipAuthRefresh: true },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new RegistrationError(error.response?.data?.error?.code);
    }
    throw new RegistrationError("unexpected_error");
  }
}

const SAFE_VERIFICATION_MESSAGES = {
  invalid_verification_code: "The verification code is invalid or has expired.",
  too_many_verification_attempts: "Too many verification attempts. Please try again later.",
  validation_error: "Check your Student ID and 6-digit verification code.",
};

export class VerificationError extends Error {
  constructor(code) {
    super(SAFE_VERIFICATION_MESSAGES[code] ?? "Unable to verify your email right now. Please try again.");
    this.name = "VerificationError";
    this.code = code;
  }
}

export async function verifyEmail({ studentId, code }) {
  try {
    const response = await api.post(
      "/auth/verify-email",
      { student_id: studentId, code },
      { skipAuthRefresh: true },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new VerificationError(error.response?.data?.error?.code);
    }
    throw new VerificationError("unexpected_error");
  }
}

export async function resendVerification(studentId) {
  try {
    const response = await api.post(
      "/auth/resend-verification",
      { student_id: studentId },
      { skipAuthRefresh: true },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new VerificationError(error.response?.data?.error?.code);
    }
    throw new VerificationError("unexpected_error");
  }
}

export async function getCurrentUser() {
  const response = await api.get("/auth/me");
  return response.data;
}

export function refreshSession() {
  return refreshAccessToken();
}

export const restoreSession = refreshSession;

export async function logout() {
  await api.post("/auth/logout", null, { skipAuthRefresh: true });
}

const SAFE_FORGOT_PASSWORD_MESSAGES = {
  too_many_password_reset_requests: "Too many password reset requests. Please try again later.",
  validation_error: "Enter a valid university email address.",
};

export class ForgotPasswordError extends Error {
  constructor(code) {
    super(SAFE_FORGOT_PASSWORD_MESSAGES[code] ?? "Unable to submit the request right now. Please try again later.");
    this.name = "ForgotPasswordError";
    this.code = code;
  }
}

export async function forgotPassword(email) {
  try {
    const response = await api.post("/auth/forgot-password", { email }, { skipAuthRefresh: true });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ForgotPasswordError(error.response?.data?.error?.code);
    }
    throw new ForgotPasswordError("unexpected_error");
  }
}

const SAFE_RESET_PASSWORD_MESSAGES = {
  invalid_password_reset_token: "This password reset link is invalid or has expired.",
  password_policy_failed: "Use a password between 12 and 128 characters that is not only whitespace.",
  password_reuse_not_allowed: "Choose a password different from your current password.",
  validation_error: "Check the reset link and new password, then try again.",
};

export class ResetPasswordError extends Error {
  constructor(code) {
    super(SAFE_RESET_PASSWORD_MESSAGES[code] ?? "Unable to reset your password right now. Please try again later.");
    this.name = "ResetPasswordError";
    this.code = code;
  }
}

export async function resetPassword({ token, newPassword }) {
  try {
    const response = await api.post(
      "/auth/reset-password",
      { token, new_password: newPassword },
      { skipAuthRefresh: true },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ResetPasswordError(error.response?.data?.error?.code);
    }
    throw new ResetPasswordError("unexpected_error");
  }
}
