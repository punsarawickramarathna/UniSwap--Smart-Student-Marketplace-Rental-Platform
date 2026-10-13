import { LoaderCircle, LogOut, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import campusMarketplace from "./assets/campus-marketplace.jpg";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { NAVIGATION_EVENT, handleAppLink, navigate } from "./navigation";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SignupPage from "./pages/SignupPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import DeliveryDashboardPage from "./pages/DeliveryDashboardPage";

function AuthLoadingScreen() {
  return (
    <main aria-label="Restoring session" className="grid min-h-screen place-items-center bg-[#f4f7f5] text-[#173f36]" role="status">
      <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_18px_60px_rgba(23,63,54,.09)]">
        <LoaderCircle aria-hidden="true" className="animate-spin" size={22} />
        <span className="text-sm font-semibold">Securing your session…</span>
      </div>
    </main>
  );
}

function SignedInView() {
  const { logout, user } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-[#13201c]">
      <header className="flex h-16 items-center justify-between border-b border-[#d8e0dc] bg-white px-5 sm:px-8">
        <a className="flex items-center gap-3 font-semibold" href="/" onClick={handleAppLink("/")}>
          <span className="grid size-9 place-items-center rounded-xl bg-[#173f36] text-white"><ShoppingBag aria-hidden="true" size={19} /></span>
          UniSwap
        </a>
        <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#8c2929] transition hover:bg-[#f8eeee]" onClick={handleLogout} type="button">
          <LogOut aria-hidden="true" size={17} /> Sign out
        </button>
      </header>
      <section className="mx-auto grid max-w-5xl gap-8 px-5 py-12 md:grid-cols-[1.1fr_0.9fr] md:items-center md:px-8 md:py-20 page-enter">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[.12em] text-[#2f6d5d]">Verified student account</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-.035em] sm:text-5xl">You&apos;re signed in.</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-[#52615b]">Welcome back{user.student_id ? `, ${user.student_id}` : ""}. Your verified email is {user.email}.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/checkout"
              onClick={handleAppLink("/checkout")}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#173f36] text-white px-6 font-bold transition hover:bg-[#0f2c25] hover:-translate-y-0.5"
            >
              Simulate Purchase (Checkout)
            </a>
            <a
              href="/deliveries"
              onClick={handleAppLink("/deliveries")}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#cbd5d0] text-[#173f36] px-6 font-semibold transition hover:bg-[#eaf2ee] hover:-translate-y-0.5"
            >
              Track Deliveries & Meetups
            </a>
          </div>
        </div>
        <img alt="University students exchanging study items on campus" className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-[0_24px_70px_rgba(22,53,44,.12)]" src={campusMarketplace} />
      </section>
    </main>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", syncPath);
    window.addEventListener(NAVIGATION_EVENT, syncPath);
    return () => {
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener(NAVIGATION_EVENT, syncPath);
    };
  }, []);

  const redirectToLoginAfterReset = useCallback(() => {
    navigate("/login", { replace: true });
  }, []);

  if (pathname === "/") return <HomePage />;
  if (pathname === "/login") return <LoginPage />;
  if (pathname === "/signup") return <SignupPage />;
  if (pathname === "/verify-email") return <VerifyEmailPage />;
  if (pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (pathname === "/reset-password") return <ResetPasswordPage onSuccess={redirectToLoginAfterReset} />;

  if (pathname === "/checkout") {
    return (
      <ProtectedRoute loadingFallback={<AuthLoadingScreen />} unauthenticatedFallback={<LoginPage />}>
        <CheckoutPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/payment-success") {
    return (
      <ProtectedRoute loadingFallback={<AuthLoadingScreen />} unauthenticatedFallback={<LoginPage />}>
        <PaymentSuccessPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/deliveries") {
    return (
      <ProtectedRoute loadingFallback={<AuthLoadingScreen />} unauthenticatedFallback={<LoginPage />}>
        <DeliveryDashboardPage />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute loadingFallback={<AuthLoadingScreen />} unauthenticatedFallback={<LoginPage />}>
      <SignedInView />
    </ProtectedRoute>
  );
}
