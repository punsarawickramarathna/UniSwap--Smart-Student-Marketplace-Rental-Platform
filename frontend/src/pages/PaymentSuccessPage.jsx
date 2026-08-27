import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, LoaderCircle, ArrowRight, Home } from "lucide-react";
import { handleAppLink, navigate } from "../navigation";
import api from "../services/api";

export default function PaymentSuccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("payment_id");
    
    if (!id) {
      setError("No payment reference found.");
      setLoading(false);
      return;
    }
    
    setPaymentId(id);

    // Call backend endpoint to confirm this simulated checkout session
    api.post(`/payment-delivery/payments/${id}/confirm`, { success: true })
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.error?.message || "Failed to confirm payment transaction.");
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-[#13201c] flex items-center justify-center px-5">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#d8e0dc] p-8 shadow-[0_12px_40px_rgba(22,53,44,0.05)] text-center page-enter">
        {loading ? (
          <div className="space-y-4 py-8">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-50 rounded-full text-[#2f6d5d]">
              <LoaderCircle className="animate-spin" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Verifying Transaction</h2>
            <p className="text-sm text-[#52615b]">Contacting university payment gateway to secure your purchase...</p>
          </div>
        ) : error ? (
          <div className="space-y-4 py-4">
            <div className="inline-flex items-center justify-center p-4 bg-red-50 rounded-full text-red-600">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Verification Failed</h2>
            <p className="text-sm text-red-700">{error}</p>
            <div className="pt-4 flex gap-3">
              <a
                className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#173f36] text-white text-sm font-semibold transition hover:bg-[#0f2c25]"
                href="/checkout"
                onClick={handleAppLink("/checkout")}
              >
                Retry Checkout
              </a>
              <a
                className="inline-flex size-11 items-center justify-center rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
                href="/"
                onClick={handleAppLink("/")}
              >
                <Home size={18} />
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="inline-flex items-center justify-center p-4 bg-[#effaf5] border border-[#cce7da] rounded-full text-[#3c8b72] animate-bounce">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Payment Confirmed!</h2>
              <p className="text-sm text-[#52615b] mt-2">
                Thank you! Your payment transaction was processed successfully. The funds are held securely until item handoff.
              </p>
            </div>

            {paymentId && (
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-left font-mono text-xs text-gray-600 space-y-1">
                <div><span className="font-semibold text-gray-400">Payment ID:</span> {paymentId}</div>
                <div><span className="font-semibold text-gray-400">Status:</span> SECURED (ESCROW)</div>
              </div>
            )}

            <div className="pt-4 space-y-3">
              <a
                className="w-full inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f36] text-white font-bold transition hover:bg-[#0f2c25]"
                href="/deliveries"
                onClick={handleAppLink("/deliveries")}
              >
                Track Delivery & Meetup
                <ArrowRight size={16} />
              </a>
              <a
                className="w-full inline-flex min-h-12 items-center justify-center rounded-xl border border-[#cbd5d0] text-[#173f36] font-semibold transition hover:bg-gray-50"
                href="/"
                onClick={handleAppLink("/")}
              >
                Return to Dashboard
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
