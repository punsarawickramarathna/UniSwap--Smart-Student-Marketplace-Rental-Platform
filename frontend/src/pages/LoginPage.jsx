import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, GraduationCap, LockKeyhole, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { useAuth } from "../context/AuthContext";
import { handleAppLink, navigate } from "../navigation";

const STUDENT_ID_PATTERN = /^ITBIN\d{8}$/;

export default function LoginPage() {
  const { authNotice, login } = useAuth();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [studentId, setStudentId] = useState((params.get("studentId") || "").toUpperCase());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const verified = params.get("verified") === "1";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setVerificationRequired(false);
    const normalizedId = studentId.trim().toUpperCase();
    if (!STUDENT_ID_PATTERN.test(normalizedId)) {
      setError("Student ID must start with ITBIN followed by exactly 8 digits.");
      return;
    }
    setIsSubmitting(true);
    try {
      await login({ studentId: normalizedId, password });
      const returnTo = params.get("returnTo");
      const safeTarget = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
      navigate(safeTarget, { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in. Please try again.");
      setVerificationRequired(loginError.code === "email_verification_required");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f2f6f4] text-[#11231d] lg:grid-cols-[1fr_.92fr]">
      <section className="relative hidden min-h-screen overflow-hidden lg:block">
        <img alt="University students exchanging useful items" className="absolute inset-0 size-full object-cover" src={campusMarketplace} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,28,23,.28),rgba(5,28,23,.9))]" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <a className="inline-flex w-fit items-center gap-3 font-bold" href="/" onClick={handleAppLink("/")}>
            <span className="grid size-11 place-items-center rounded-2xl bg-white/12 backdrop-blur-xl"><GraduationCap size={21} /></span>
            UniSwap
          </a>
          <div className="max-w-lg page-enter">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#a6ebcb]">Welcome back</p>
            <h2 className="mt-4 text-5xl font-semibold leading-[.98] tracking-[-.045em]">Your campus marketplace is waiting.</h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/68">Sign in with your verified Student ID. Your university email stays behind the identity-verification layer.</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center px-5 py-10 sm:px-9 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-md page-enter">
          <div className="mb-8 flex items-center justify-between">
            <a className="inline-flex items-center gap-2 text-sm font-semibold text-[#586b64] transition hover:text-[#173f36]" href="/" onClick={handleAppLink("/")}><ArrowLeft size={17} /> Home</a>
            <p className="text-sm text-[#687871]">New here? <a className="font-bold text-[#1f6653]" href="/signup" onClick={handleAppLink("/signup")}>Sign up</a></p>
          </div>

          <p className="text-xs font-bold uppercase tracking-[.17em] text-[#397763]">Student sign in</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Welcome back.</h1>
          <p className="mt-3 text-sm leading-6 text-[#687871]">Enter the Student ID connected to your verified UniSwap account.</p>

          {verified ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#cce7da] bg-[#effaf5] px-4 py-3 text-sm leading-6 text-[#28624f]" role="status">
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
              University email verified successfully. You can sign in now.
            </div>
          ) : null}
          {authNotice ? <div className="mt-6 rounded-2xl border border-[#ead8ad] bg-[#fff9eb] px-4 py-3 text-sm leading-6 text-[#76571f]" role={authNotice.type === "warning" ? "alert" : "status"}>{authNotice.message}</div> : null}

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-bold" htmlFor="login-student-id">Student ID</label>
              <div className="relative">
                <UserRound aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#75857f]" size={18} />
                <input autoCapitalize="characters" autoComplete="username" className="auth-input auth-input--leading-icon font-mono uppercase tracking-[.04em]" id="login-student-id" maxLength={13} onChange={(event) => setStudentId(event.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="ITBIN12345678" required value={studentId} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-bold" htmlFor="login-password">Password</label>
                <a className="text-xs font-bold text-[#347461] transition hover:text-[#173f36]" href="/forgot-password" onClick={handleAppLink("/forgot-password")}>Forgot password?</a>
              </div>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#75857f]" size={18} />
                <input autoComplete="current-password" className="auth-input auth-input--leading-icon auth-input--trailing-action" id="login-password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} />
                <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-[#687972] transition hover:bg-[#edf4f1]" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>

            {error ? <div className="rounded-2xl border border-[#efcaca] bg-[#fff2f2] px-4 py-3 text-sm leading-6 text-[#8b3232]" role="alert">{error}</div> : null}
            {verificationRequired ? (
              <button className="w-full text-center text-sm font-bold text-[#2a725d] underline decoration-[#98cbb9] underline-offset-4" onClick={() => navigate(`/verify-email?studentId=${encodeURIComponent(studentId)}`)} type="button">Enter verification code</button>
            ) : null}

            <button className="group inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f36] px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(23,63,54,.16)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#245b4d] disabled:cursor-wait disabled:opacity-60" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in..." : "Sign in securely"}
              {!isSubmitting ? <ArrowRight className="transition group-hover:translate-x-1" size={17} /> : null}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
