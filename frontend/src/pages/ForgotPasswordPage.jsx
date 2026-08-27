import { ArrowLeft, Mail, Send, ShoppingBag } from "lucide-react";
import { useState } from "react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { forgotPassword } from "../services/auth";
import { handleAppLink } from "../navigation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to submit the request right now. Please try again later.",
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
            <p className="text-sm font-semibold uppercase">Account recovery</p>
            <p className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl">
              Get back to your campus marketplace securely.
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
            Forgot password
          </p>
          <h1 className="text-4xl font-semibold leading-tight">
            Reset your password
          </h1>
          <p className="mt-3 text-base leading-7 text-[#5d6964]">
            Enter your university email. If an eligible account exists, we&apos;ll
            send password reset instructions.
          </p>

          <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="reset-email">
                University email
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#73817b]"
                  size={19}
                />
                <input
                  autoComplete="email"
                  className="h-12 w-full border border-[#cbd5d0] bg-white pl-12 pr-4 text-base outline-none transition focus:border-[#2f6d5d] focus:ring-2 focus:ring-[#2f6d5d]/20"
                  id="reset-email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@university.edu"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            {message ? (
              <p
                className="border-l-4 border-[#2f6d5d] bg-[#edf7f2] px-4 py-3 text-sm leading-6 text-[#173f36]"
                role="status"
              >
                {message}
              </p>
            ) : null}

            {error ? (
              <p
                className="border-l-4 border-[#b43c3c] bg-[#fbefef] px-4 py-3 text-sm leading-6 text-[#782424]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#173f36] px-5 text-base font-semibold text-white transition hover:bg-[#24574b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f36] disabled:cursor-wait disabled:bg-[#6f817a]"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Submitting..." : "Send reset instructions"}
              {!isSubmitting ? <Send aria-hidden="true" size={18} /> : null}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
