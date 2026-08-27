import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Truck, Calendar, QrCode, ClipboardCheck, LoaderCircle, CheckCircle2, ShieldAlert, ShoppingBag } from "lucide-react";
import { handleAppLink, navigate } from "../navigation";
import api from "../services/api";

export default function DeliveryDashboardPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Verification popup/form state
  const [verifyingDeliveryId, setVerifyingDeliveryId] = useState(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSuccess, setVerificationSuccess] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    fetchDeliveries();
  }, []);

  function fetchDeliveries() {
    setLoading(true);
    api.get("/payment-delivery/deliveries/user")
      .then((res) => {
        setDeliveries(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to fetch delivery logs. Please try again.");
        setLoading(false);
      });
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setVerificationError("");
    setVerificationSuccess("");
    setIsVerifying(true);

    try {
      const response = await api.post(`/payment-delivery/deliveries/${verifyingDeliveryId}/verify-qr`, {
        verification_code: verificationCode.trim().toUpperCase(),
      });

      if (response.data.success) {
        setVerificationSuccess("Handoff verified successfully! Transaction is complete.");
        setVerificationCode("");
        setTimeout(() => {
          setVerifyingDeliveryId(null);
          setVerificationSuccess("");
          fetchDeliveries(); // Reload list
        }, 2000);
      } else {
        setVerificationError("Invalid verification code. Please make sure the seller scans your QR or matches the code.");
      }
    } catch (err) {
      setVerificationError(err.response?.data?.error?.message || "Handoff verification failed.");
    } finally {
      setIsVerifying(false);
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-[#13201c]">
      <header className="flex h-16 items-center justify-between border-b border-[#d8e0dc] bg-white px-5 sm:px-8">
        <a className="flex items-center gap-3 font-semibold" href="/" onClick={handleAppLink("/")}>
          <span className="grid size-9 place-items-center rounded-xl bg-[#173f36] text-white">
            <ClipboardCheck aria-hidden="true" size={19} />
          </span>
          UniSwap
        </a>
        <div className="flex items-center gap-3">
          <a className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eaf2ee] px-4 py-2 text-sm font-semibold text-[#173f36] transition" href="/checkout" onClick={handleAppLink("/checkout")}>
            New Checkout
          </a>
          <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cbd5d0] px-4 py-2 text-sm font-semibold text-[#173f36] transition hover:bg-[#eaf2ee]" href="/" onClick={handleAppLink("/")}>
            <ArrowLeft size={16} /> Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:px-10 page-enter">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Delivery & Handoff Tracking</h1>
            <p className="mt-2 text-sm text-[#52615b]">Track shipping packages and manage campus meetups.</p>
          </div>
          <button
            onClick={fetchDeliveries}
            className="self-start inline-flex items-center gap-2 text-sm font-semibold text-[#2f6d5d] hover:underline"
            type="button"
          >
            Refresh tracking logs
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#d8e0dc]">
            <LoaderCircle className="animate-spin text-[#2f6d5d] mb-4" size={32} />
            <p className="text-sm font-semibold text-[#52615b]">Loading tracking dashboard...</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-[#d8e0dc]">
            <ShoppingBag className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-900">No active shipments or meetups</h3>
            <p className="text-sm text-[#52615b] mt-1 max-w-sm mx-auto">
              Any purchases or meetups you schedule will be visible here to track and verify.
            </p>
            <a
              href="/checkout"
              onClick={handleAppLink("/checkout")}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#173f36] text-white px-5 font-bold transition hover:bg-[#0f2c25]"
            >
              Simulate a Purchase
            </a>
          </div>
        ) : (
          <div className="grid gap-6">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="bg-white rounded-3xl border border-[#d8e0dc] p-6 shadow-[0_4px_20px_rgba(23,63,54,0.02)] flex flex-col md:grid md:grid-cols-[1.5fr_1fr_0.8fr] gap-6 items-center"
              >
                {/* Method & Info */}
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-10 place-items-center rounded-2xl ${
                      delivery.delivery_method === "meetup" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {delivery.delivery_method === "meetup" ? <MapPin size={20} /> : <Truck size={20} />}
                    </span>
                    <div>
                      <h3 className="font-bold text-gray-900 capitalize">
                        {delivery.delivery_method === "meetup" ? "Campus Meetup handoff" : "Standard Shipping"}
                      </h3>
                      <p className="text-xs font-mono text-[#75857f] mt-0.5">Order Ref: {delivery.order_id.slice(0, 8)}...</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pl-13 text-sm text-[#52615b]">
                    {delivery.delivery_method === "meetup" ? (
                      <>
                        <div className="flex items-center gap-2">
                          <MapPin size={15} className="text-gray-400" />
                          <span>Location: **{delivery.meetup_location}**</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar size={15} className="text-gray-400" />
                          <span>Time: {formatDateTime(delivery.meetup_time)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Truck size={15} className="text-gray-400" />
                        <span>Tracking: <span className="font-mono bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded text-gray-800">{delivery.tracking_number}</span></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="w-full flex flex-col items-center md:items-start space-y-1">
                  <span className="text-xs font-bold text-[#75857f] uppercase tracking-wider">Handoff Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${
                      delivery.status === "delivered" ? "bg-[#3c8b72]" : 
                      delivery.status === "cancelled" ? "bg-red-500" : "bg-amber-500"
                    }`} />
                    <span className="font-bold capitalize text-sm">
                      {delivery.status === "scheduled" ? "Scheduled / Pending Handoff" : delivery.status}
                    </span>
                  </div>
                </div>

                {/* Handoff Actions */}
                <div className="w-full flex flex-col items-stretch gap-2.5">
                  {delivery.status === "scheduled" && delivery.delivery_method === "meetup" && (
                    <button
                      onClick={() => setVerifyingDeliveryId(delivery.id)}
                      className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#3c8b72] hover:bg-[#effaf5] text-[#1f6653] text-sm font-bold transition"
                      type="button"
                    >
                      <QrCode size={16} /> Verify Handoff
                    </button>
                  )}
                  {delivery.status === "delivered" ? (
                    <div className="inline-flex min-h-10 items-center justify-center gap-1.5 text-xs font-bold text-[#3c8b72] bg-[#effaf5] border border-[#cce7da] rounded-xl px-3 py-1">
                      <CheckCircle2 size={16} /> Trade Completed
                    </div>
                  ) : delivery.status === "cancelled" ? (
                    <div className="inline-flex min-h-10 items-center justify-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-1">
                      <ShieldAlert size={16} /> Cancelled / Refunded
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verification Code/QR Modal */}
      {verifyingDeliveryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#d8e0dc] p-6 shadow-2xl relative page-enter">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
              <QrCode className="text-[#2f6d5d]" /> Verify Physical Meetup
            </h2>
            <p className="text-xs text-[#52615b] leading-5 mb-5">
              Show this QR code to the seller to scan, or have them input your 6-character code below to finalize the trade.
            </p>

            {/* Generated QR Code Server Image */}
            {deliveries.find(d => d.id === verifyingDeliveryId) && (
              <div className="flex flex-col items-center justify-center p-5 bg-gray-50 border border-gray-100 rounded-2xl mb-5">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${deliveries.find(d => d.id === verifyingDeliveryId).verification_code}`}
                  alt="Handoff Verification QR Code"
                  className="size-36 border-4 border-white shadow-sm"
                />
                <span className="block mt-4 font-mono font-extrabold text-2xl tracking-[.18em] text-[#173f36]">
                  {deliveries.find(d => d.id === verifyingDeliveryId).verification_code}
                </span>
                <span className="block mt-1.5 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                  Verification Code
                </span>
              </div>
            )}

            {/* Simulate Code verification form */}
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">
                  Simulate scanning/typing code
                </label>
                <input
                  type="text"
                  placeholder="Enter 6-char code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                  className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-center font-mono font-bold uppercase tracking-wider focus:border-[#3c8b72]"
                  required
                />
              </div>

              {verificationSuccess && (
                <div className="p-3 text-xs bg-[#effaf5] border border-[#cce7da] text-[#28624f] rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" /> {verificationSuccess}
                </div>
              )}

              {verificationError && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl">
                  {verificationError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setVerifyingDeliveryId(null);
                    setVerificationError("");
                    setVerificationSuccess("");
                  }}
                  className="flex-1 min-h-11 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 text-sm transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 min-h-11 bg-[#173f36] hover:bg-[#0f2c25] rounded-xl font-bold text-white text-sm transition disabled:opacity-50"
                >
                  {isVerifying ? "Verifying..." : "Confirm Handoff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
