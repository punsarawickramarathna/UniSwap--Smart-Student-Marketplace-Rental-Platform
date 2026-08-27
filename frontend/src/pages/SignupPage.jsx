import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, GraduationCap, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { handleAppLink, navigate } from "../navigation";
import { register } from "../services/auth";

const STUDENT_ID_PATTERN = /^ITBIN\d{8}$/;

export default function SignupPage() {
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedId = studentId.trim().toUpperCase();
  const idValid = STUDENT_ID_PATTERN.test(normalizedId);
  const passwordValid = password.length >= 12 && password.length <= 128;
  const passwordsMatch = password && password === confirmPassword;
  const canSubmit = idValid && passwordValid && passwordsMatch && Boolean(email);

  const idHint = useMemo(() => {
    if (!studentId) return "Format: ITBIN + exactly 8 digits";
    if (idValid) return "Student ID format verified";
    return "Example: ITBIN12345678";
  }, [idValid, studentId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!canSubmit) {
      setError("Check your Student ID, university email, and password before continuing.");
      return;
    }
    setIsSubmitting(true);
    try {
      await register({ studentId: normalizedId, email, password });
      navigate(`/verify-email?studentId=${encodeURIComponent(normalizedId)}`);
    } catch (registrationError) {
      setError(registrationError.message || "Unable to create your account right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef4f1] text-[#10231d] lg:grid lg:grid-cols-[.86fr_1.14fr]">
      <aside className="relative hidden min-h-screen overflow-hidden lg:block">
        <img alt="University students on campus" className="absolute inset-0 size-full object-cover" src={campusMarketplace} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,31,25,.34),rgba(5,31,25,.92))]" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <a className="inline-flex w-fit items-center gap-3 font-bold" href="/" onClick={handleAppLink("/")}> 
            <span className="grid size-11 place-items-center rounded-2xl bg-white/12 backdrop-blur-xl"><GraduationCap size={21} /></span>
            UniSwap
          </a>
          <div className="max-w-lg page-enter">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-[.14em] backdrop-blur-lg">
              <ShieldCheck size={15} /> Verified campus access
            </div>
            <h2 className="text-5xl font-semibold leading-[.98] tracking-[-.045em]">One account. Your student marketplace.</h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/70">Student ID and university email verification keep UniSwap focused on real campus members.</p>
          </div>
        </div>
      </aside>

      <section className="relative flex min-h-screen items-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-xl page-enter">
          <div className="mb-7 flex items-center justify-between">
            <a className="inline-flex items-center gap-2 text-sm font-semibold text-[#4e625b] transition hover:text-[#173f36]" href="/" onClick={handleAppLink("/")}>
              <ArrowLeft size={17} /> Home
            </a>
            <p className="text-sm text-[#64756f]">Already registered? <a className="font-bold text-[#1f6653]" href="/login" onClick={handleAppLink("/login")}>Log in</a></p>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/86 p-6 shadow-[0_28px_80px_rgba(29,67,55,.10)] backdrop-blur-xl sm:p-9">
            <div className="mb-8 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#173f36] text-sm font-bold text-white">1</span>
              <div className="h-px flex-1 bg-[#d8e4df]" />
              <span className="grid size-10 place-items-center rounded-full border border-[#cfdcd7] bg-white text-sm font-bold text-[#71807a]">2</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-[.17em] text-[#3a7966]">Create your account</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Join your campus network.</h1>
            <p className="mt-3 text-sm leading-6 text-[#66766f]">Use the Student ID issued to you and an approved university email address.</p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="student-id">Student ID</label>
                <div className="relative">
                  <UserRound aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#7a8b84]" size={18} />
                  <input
                    autoCapitalize="characters"
                    autoComplete="username"
                    className="auth-input auth-input--leading-icon auth-input--trailing-action font-mono uppercase tracking-[.04em]"
                    id="student-id"
                    inputMode="text"
                    maxLength={13}
                    onChange={(event) => setStudentId(event.target.value.toUpperCase().replace(/\s/g, ""))}
                    placeholder="ITBIN12345678"
                    required
                    value={studentId}
                  />
                  {idValid ? <Check className="absolute right-4 top-1/2 -translate-y-1/2 text-[#27805f]" size={18} /> : null}
                </div>
                <p className={`mt-2 text-xs ${studentId && !idValid ? "text-[#b24848]" : idValid ? "text-[#27805f]" : "text-[#7b8984]"}`}>{idHint}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="signup-email">University email</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#7a8b84]" size={18} />
                  <input autoComplete="email" className="auth-input auth-input--leading-icon" id="signup-email" onChange={(event) => setEmail(event.target.value)} placeholder="itbin-2211-0316@horizoncampus.edu.lk" required type="email" value={email} />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="signup-password">Password</label>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#7a8b84]" size={18} />
                  <input autoComplete="new-password" className="auth-input auth-input--leading-icon auth-input--trailing-action" id="signup-password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} />
                  <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-[#687972] transition hover:bg-[#eef5f2]" onClick={() => setShowPassword((value) => !value)} type="button">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className={`mt-2 text-xs ${password && !passwordValid ? "text-[#b24848]" : passwordValid ? "text-[#27805f]" : "text-[#7b8984]"}`}>12–128 characters</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="confirm-password">Confirm password</label>
                <input autoComplete="new-password" className="auth-input" id="confirm-password" onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
                {confirmPassword && !passwordsMatch ? <p className="mt-2 text-xs text-[#b24848]">Passwords do not match.</p> : null}
              </div>

              {error ? <div className="rounded-2xl border border-[#efcaca] bg-[#fff2f2] px-4 py-3 text-sm leading-6 text-[#8b3232]" role="alert">{error}</div> : null}

              <button className="group inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f36] px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(23,63,54,.18)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#245b4d] disabled:cursor-wait disabled:opacity-60" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating secure account..." : "Continue to verification"}
                {!isSubmitting ? <ArrowRight className="transition group-hover:translate-x-1" size={17} /> : null}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
