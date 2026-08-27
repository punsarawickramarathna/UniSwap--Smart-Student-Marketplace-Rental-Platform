import { ArrowLeft, CheckCircle2, MailCheck, RefreshCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { handleAppLink, navigate } from "../navigation";
import { resendVerification, verifyEmail } from "../services/auth";

const CODE_LENGTH = 6;

export default function VerifyEmailPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const studentId = (params.get("studentId") || "").toUpperCase();
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function updateDigit(index, value) {
    const nextValue = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((digit, position) => (position === index ? nextValue : digit)));
    if (nextValue && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    pasted.split("").forEach((digit, index) => {
      next[index] = digit;
    });
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH) - 1]?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!studentId) {
      setError("Student ID is missing. Return to sign up and try again.");
      return;
    }
    const code = digits.join("");
    if (code.length !== CODE_LENGTH) {
      setError("Enter the complete 6-digit verification code.");
      return;
    }
    setIsSubmitting(true);
    try {
      await verifyEmail({ studentId, code });
      navigate(`/login?verified=1&studentId=${encodeURIComponent(studentId)}`, { replace: true });
    } catch (verificationError) {
      setError(verificationError.message || "Unable to verify your email right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendSeconds > 0 || !studentId) return;
    setError("");
    setNotice("");
    try {
      const result = await resendVerification(studentId);
      setNotice(result.message);
      setResendSeconds(60);
    } catch (resendError) {
      setError(resendError.message || "Unable to resend the verification code right now.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a211c] px-5 py-8 text-white sm:px-8">
      <div className="absolute -left-32 top-8 size-80 rounded-full bg-[#54d99f]/10 blur-3xl" />
      <div className="absolute -right-32 bottom-0 size-96 rounded-full bg-[#69c9ff]/8 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <div className="flex items-center justify-between">
          <a className="inline-flex items-center gap-2 text-sm font-semibold text-white/65 transition hover:text-white" href="/signup" onClick={handleAppLink("/signup")}>
            <ArrowLeft size={17} /> Back to sign up
          </a>
          <div className="hidden items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-emerald-100/60 sm:flex">
            <ShieldCheck size={15} /> Secure verification
          </div>
        </div>

        <div className="grid flex-1 place-items-center py-12">
          <section className="w-full max-w-xl rounded-[2.25rem] border border-white/12 bg-white/[.075] p-6 shadow-[0_36px_100px_rgba(0,0,0,.28)] backdrop-blur-2xl sm:p-10 page-enter">
            <div className="mx-auto grid size-16 place-items-center rounded-[1.35rem] bg-[#dfffee] text-[#0a3b30] shadow-[0_12px_40px_rgba(70,228,169,.16)]">
              <MailCheck size={29} />
            </div>
            <div className="mt-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#95e8c4]">Step 2 of 2</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Check your university email.</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/62">
                We sent a 6-digit code for <span className="font-mono font-bold text-white">{studentId || "your Student ID"}</span>. Enter it below to activate your UniSwap account.
              </p>
            </div>

            <form className="mt-9" onSubmit={handleSubmit}>
              <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
                {digits.map((digit, index) => (
                  <input
                    aria-label={`Verification digit ${index + 1}`}
                    className="h-14 w-11 rounded-2xl border border-white/14 bg-white/10 text-center text-xl font-bold text-white outline-none transition duration-200 focus:-translate-y-0.5 focus:border-[#8ee9c2] focus:bg-white/15 focus:ring-4 focus:ring-[#66dba8]/10 sm:h-16 sm:w-14 sm:text-2xl"
                    inputMode="numeric"
                    key={index}
                    maxLength={1}
                    onChange={(event) => updateDigit(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    ref={(element) => { inputRefs.current[index] = element; }}
                    value={digit}
                  />
                ))}
              </div>

              {notice ? (
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200/15 bg-emerald-50/8 px-4 py-3 text-sm leading-6 text-emerald-50" role="status">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#8de5be]" size={18} />
                  {notice}
                </div>
              ) : null}
              {error ? <div className="mt-6 rounded-2xl border border-red-200/15 bg-red-100/8 px-4 py-3 text-sm leading-6 text-red-100" role="alert">{error}</div> : null}

              <button className="mt-7 inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-[#dfffee] px-6 py-3.5 text-sm font-bold text-[#0a392e] shadow-[0_16px_38px_rgba(74,225,169,.16)] transition duration-300 hover:-translate-y-0.5 hover:bg-white disabled:cursor-wait disabled:opacity-60" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Verifying..." : "Verify university email"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/56">
              <span>Didn&apos;t receive it?</span>
              <button className="inline-flex items-center gap-1.5 font-bold text-[#a8f0d1] transition hover:text-white disabled:cursor-not-allowed disabled:text-white/28" disabled={resendSeconds > 0} onClick={handleResend} type="button">
                <RefreshCcw size={14} />
                {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
