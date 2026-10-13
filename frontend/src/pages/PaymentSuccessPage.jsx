import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, LoaderCircle, ArrowRight, Home, Printer, FileText } from "lucide-react";
import { handleAppLink, navigate } from "../navigation";
import api from "../services/api";

export default function PaymentSuccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState(null);
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("payment_id");

    if (!id) {
      setError("No payment reference found.");
      setLoading(false);
      return;
    }

    setPaymentId(id);

    // Call backend endpoint to confirm payment transaction
    api.post(`/payment-delivery/payments/${id}/confirm`, { success: true })
      .then(() => {
        // Fetch invoice details for display
        return api.get(`/payment-delivery/payments/${id}/invoice`);
      })
      .then((invRes) => {
        setInvoice(invRes.data);
        setLoading(false);
      })
      .catch((err) => {
        // If already confirmed or fetched, try fetching invoice directly
        api.get(`/payment-delivery/payments/${id}/invoice`)
          .then((invRes) => {
            setInvoice(invRes.data);
            setLoading(false);
          })
          .catch(() => {
            setError(err.response?.data?.error?.message || "Payment confirmation processed.");
            setLoading(false);
          });
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-[#13201c] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-[#d8e0dc] p-8 shadow-[0_12px_40px_rgba(22,53,44,0.05)] text-center page-enter">
        {loading ? (
          <div className="space-y-4 py-8">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-50 rounded-full text-[#2f6d5d]">
              <LoaderCircle className="animate-spin" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Confirming Payment & Issuing Receipt</h2>
            <p className="text-sm text-[#52615b]">Contacting campus payment gateway to finalize transaction...</p>
          </div>
        ) : error && !invoice ? (
          <div className="space-y-4 py-4">
            <div className="inline-flex items-center justify-center p-4 bg-red-50 rounded-full text-red-600">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Verification Alert</h2>
            <p className="text-sm text-red-700">{error}</p>
            <div className="pt-4 flex gap-3">
              <a
                className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#173f36] text-white text-sm font-semibold transition hover:bg-[#0f2c25]"
                href="/checkout"
                onClick={handleAppLink("/checkout")}
              >
                Go to Checkout
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
          <div className="space-y-6 py-2 text-left">
            <div className="text-center">
              <div className="inline-flex items-center justify-center p-3.5 bg-[#effaf5] border border-[#cce7da] rounded-full text-[#3c8b72] mb-3">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Payment Confirmed!</h2>
              <p className="text-xs text-[#52615b] mt-1">
                Your payment transaction was processed securely. Funds are held in escrow until item handoff is completed.
              </p>
            </div>

            {/* Official Invoice Card */}
            {invoice && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <div>
                    <span className="font-extrabold text-[#173f36] text-sm block">UniSwap Official Receipt</span>
                    <span className="font-mono text-[11px] text-gray-500">{invoice.invoice_id}</span>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full uppercase text-[10px]">
                    {invoice.payment_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-gray-600">
                  <div>
                    <span className="font-semibold block text-gray-400">ITEM</span>
                    <span className="font-bold text-gray-900">{invoice.item_title}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-gray-400">TOTAL AMOUNT</span>
                    <span className="font-bold font-mono text-gray-900">{invoice.amount.toFixed(2)} {invoice.currency}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-gray-400">HANDOFF METHOD</span>
                    <span className="font-bold capitalize text-gray-900">{invoice.delivery_method}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-gray-400">PAYMENT</span>
                    <span className="font-bold uppercase text-gray-900">{invoice.payment_method}</span>
                  </div>
                </div>

                {invoice.transaction_reference && (
                  <div className="pt-1 font-mono text-[10px] text-gray-400">
                    Ref: {invoice.transaction_reference}
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold text-sm transition hover:bg-gray-50 shadow-sm"
              >
                <Printer size={16} /> Print Official Receipt
              </button>

              <a
                className="w-full inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f36] text-white font-bold transition hover:bg-[#0f2c25]"
                href="/deliveries"
                onClick={handleAppLink("/deliveries")}
              >
                Track Delivery & Meetup
                <ArrowRight size={16} />
              </a>

              <a
                className="w-full inline-flex min-h-10 items-center justify-center rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-800 transition"
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
