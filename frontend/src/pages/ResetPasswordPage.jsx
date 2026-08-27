import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { useAuth } from "../context/AuthContext";
import { handleAppLink } from "../navigation";

export default function ResetPasswordPage({ onSuccess }) {
  const { resetPassword } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("This password reset link is invalid or has expired.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword({ token, newPassword });
      onSuccess?.();
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to reset your password right now. Please try again later.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f7f8f7] text-[#13201c] lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section className="relative min-h-64 overflow-hidden lg:min-h-screen">
        <img
          alt="University students exchanging study items on campus"
          className="absolute inset-0 size-full object-cover object-center"
          src={campusMarketplace}
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative flex h-full min-h-64 flex-col justify-between p-6 text-white sm:p-9 lg:min-h-screen lg:p-12">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <span className="grid size-10 place-items-center bg-[#edf7f2] text-[#173f36]">
              <ShoppingBag aria-hidden="true" size={21} />
            </span>
            UniSwap
          </div>
          <div className="max-w-xl pb-1">
            <p className="text-sm font-semibold uppercase">Secure recovery</p>
            <p className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl">
              Choose a new password for your student account.
            </p>
          </div>
        </div>
      </section>

      <section className="flex items-center px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <a
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#2f6d5d] hover:text-[#173f36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6d5d]"
            href="/login" onClick={handleAppLink("/login")}
          >
            <ArrowLeft aria-hidden="true" size={17} />
            Back to sign in
          </a>

          <p className="mb-3 text-sm font-semibold uppercase text-[#2f6d5d]">
            Reset password
          </p>
          <h1 className="text-4xl font-semibold leading-tight">Create a new password</h1>
          <p className="mt-3 text-base leading-7 text-[#5d6964]">
            Use 12–128 characters. For security, choose a password different from
            your current password.
          </p>

          {!token ? (
            <p
              className="mt-6 border-l-4 border-[#b43c3c] bg-[#fbefef] px-4 py-3 text-sm leading-6 text-[#782424]"
              role="alert"
            >
              This password reset link is invalid or has expired.
            </p>
          ) : null}

          <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="new-password">
                New password
              </label>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#73817b]"
                  size={19}
                />
                <input
                  autoComplete="new-password"
                  className="h-12 w-full border border-[#cbd5d0] bg-white pl-12 pr-12 text-base outline-none transition focus:border-[#2f6d5d] focus:ring-2 focus:ring-[#2f6d5d]/20"
                  disabled={!token}
                  id="new-password"
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                />
                <button
                  aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                  className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-[#5d6964] hover:text-[#173f36] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f6d5d]"
                  disabled={!token}
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="confirm-password">
                Confirm new password
              </label>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#73817b]"
                  size={19}
                />
                <input
                  autoComplete="new-password"
                  className="h-12 w-full border border-[#cbd5d0] bg-white pl-12 pr-4 text-base outline-none transition focus:border-[#2f6d5d] focus:ring-2 focus:ring-[#2f6d5d]/20"
                  disabled={!token}
                  id="confirm-password"
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                />
              </div>
            </div>

            {error ? (
              <p
                className="border-l-4 border-[#b43c3c] bg-[#fbefef] px-4 py-3 text-sm leading-6 text-[#782424]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#173f36] px-5 text-base font-semibold text-white transition hover:bg-[#24574b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f36] disabled:cursor-not-allowed disabled:bg-[#6f817a]"
              disabled={!token || isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Resetting password..." : "Reset password"}
              {!isSubmitting ? <ArrowRight aria-hidden="true" size={19} /> : null}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
