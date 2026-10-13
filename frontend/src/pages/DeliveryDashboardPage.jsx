import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Truck,
  Calendar,
  QrCode,
  ClipboardCheck,
  LoaderCircle,
  CheckCircle2,
  ShieldAlert,
  ShoppingBag,
  FileText,
  Printer,
  Package,
  X,
  ExternalLink,
} from "lucide-react";
import { handleAppLink, navigate } from "../navigation";
import api from "../services/api";

export default function DeliveryDashboardPage() {
  const [activeTab, setActiveTab] = useState("buyer"); // "buyer" or "seller"
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Buyer: Show QR modal
  const [showQrModalId, setShowQrModalId] = useState(null);

  // Seller: Verify Code modal
  const [verifyingDeliveryId, setVerifyingDeliveryId] = useState(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSuccess, setVerificationSuccess] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // Seller: Update Shipping modal
  const [shippingModalDelivery, setShippingModalDelivery] = useState(null);
  const [shippingCarrier, setShippingCarrier] = useState("SL Post Registered Mail");
  const [shippingTrackingNumber, setShippingTrackingNumber] = useState("");
  const [shippingStatus, setShippingStatus] = useState("shipped");
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [shippingUpdateMsg, setShippingUpdateMsg] = useState("");

  // Invoice modal
  const [invoiceData, setInvoiceData] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  useEffect(() => {
    fetchDeliveries(activeTab);
  }, [activeTab]);

  function fetchDeliveries(role) {
    setLoading(true);
    api
      .get(`/payment-delivery/deliveries/user?role=${role}`)
      .then((res) => {
        setDeliveries(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to fetch delivery records. Please try again.");
        setLoading(false);
      });
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setVerificationError("");
    setVerificationSuccess("");
    setIsVerifying(true);

    try {
      const response = await api.post(
        `/payment-delivery/deliveries/${verifyingDeliveryId}/verify-qr`,
        {
          verification_code: verificationCode.trim().toUpperCase(),
        }
      );

      if (response.data.success) {
        setVerificationSuccess(
          response.data.message || "Handoff verified successfully! Transaction completed."
        );
        setVerificationCode("");
        setTimeout(() => {
          setVerifyingDeliveryId(null);
          setVerificationSuccess("");
          fetchDeliveries(activeTab);
        }, 1800);
      } else {
        setVerificationError(
          response.data.message || "Invalid verification code. Please try again."
        );
      }
    } catch (err) {
      setVerificationError(
        err.response?.data?.error?.message || "Handoff verification failed."
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleUpdateShipping(e) {
    e.preventDefault();
    setIsUpdatingShipping(true);
    setShippingUpdateMsg("");

    try {
      await api.post(
        `/payment-delivery/deliveries/${shippingModalDelivery.id}/shipping-status`,
        {
          status: shippingStatus,
          carrier: shippingCarrier,
          tracking_number: shippingTrackingNumber,
        }
      );
      setShippingUpdateMsg("Shipping status updated successfully!");
      setTimeout(() => {
        setShippingModalDelivery(null);
        setShippingUpdateMsg("");
        fetchDeliveries(activeTab);
      }, 1200);
    } catch (err) {
      setShippingUpdateMsg(
        err.response?.data?.error?.message || "Failed to update shipping status."
      );
    } finally {
      setIsUpdatingShipping(false);
    }
  }

  async function viewInvoice(delivery) {
    setInvoiceData(null);
    setInvoiceError("");
    setLoadingInvoice(true);
    try {
      // Find payments to get the payment ID for this order
      const paymentsRes = await api.get("/payment-delivery/payments/user");
      const matchedPayment = paymentsRes.data.find(
        (p) => p.order_id === delivery.order_id
      );

      if (!matchedPayment) {
        throw new Error("No payment record found for this order.");
      }

      const invRes = await api.get(
        `/payment-delivery/payments/${matchedPayment.payment_id}/invoice`
      );
      setInvoiceData(invRes.data);
    } catch (err) {
      setInvoiceError(err.message || "Could not generate invoice.");
    } finally {
      setLoadingInvoice(false);
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
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eaf2ee] px-4 py-2 text-sm font-semibold text-[#173f36] transition"
            href="/checkout"
            onClick={handleAppLink("/checkout")}
          >
            New Checkout
          </a>
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cbd5d0] px-4 py-2 text-sm font-semibold text-[#173f36] transition hover:bg-[#eaf2ee]"
            href="/"
            onClick={handleAppLink("/")}
          >
            <ArrowLeft size={16} /> Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:px-10 page-enter">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Delivery & Handoff Tracking</h1>
            <p className="mt-2 text-sm text-[#52615b]">
              Manage physical campus handoffs, track courier shipments, and view official invoices.
            </p>
          </div>
          <button
            onClick={() => fetchDeliveries(activeTab)}
            className="self-start inline-flex items-center gap-2 text-sm font-semibold text-[#2f6d5d] hover:underline"
            type="button"
          >
            Refresh records
          </button>
        </div>

        {/* Tab Switcher: Buyer vs Seller */}
        <div className="mb-8 flex gap-3 border-b border-[#cbd5d0] pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("buyer")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === "buyer"
                ? "bg-[#173f36] text-white shadow-sm"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <ShoppingBag size={17} /> My Purchases (Buyer View)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("seller")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === "seller"
                ? "bg-[#173f36] text-white shadow-sm"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <Package size={17} /> My Sales to Fulfill (Seller View)
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
            <p className="text-sm font-semibold text-[#52615b]">Loading tracking records...</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-[#d8e0dc]">
            <ShoppingBag className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-900">
              {activeTab === "buyer" ? "No purchases found" : "No active sales or orders to fulfill"}
            </h3>
            <p className="text-sm text-[#52615b] mt-1 max-w-sm mx-auto">
              {activeTab === "buyer"
                ? "Items you purchase will appear here with meetup verification QR codes and tracking."
                : "When students order your listed items, you can fulfill shipping or verify meetup handoffs here."}
            </p>
            {activeTab === "buyer" && (
              <a
                href="/checkout"
                onClick={handleAppLink("/checkout")}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#173f36] text-white px-5 font-bold transition hover:bg-[#0f2c25]"
              >
                Place a Test Order
              </a>
            )}
          </div>
        ) : (
          <div className="grid gap-6">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="bg-white rounded-3xl border border-[#d8e0dc] p-6 shadow-[0_4px_20px_rgba(23,63,54,0.02)] flex flex-col md:grid md:grid-cols-[1.5fr_1fr_1fr] gap-6 items-center"
              >
                {/* Method & Info */}
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid size-10 place-items-center rounded-2xl ${
                        delivery.delivery_method === "meetup"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {delivery.delivery_method === "meetup" ? (
                        <MapPin size={20} />
                      ) : (
                        <Truck size={20} />
                      )}
                    </span>
                    <div>
                      <h3 className="font-bold text-gray-900 capitalize">
                        {delivery.delivery_method === "meetup"
                          ? "Campus Physical Meetup"
                          : "Parcel Courier Delivery"}
                      </h3>
                      <p className="text-xs font-mono text-[#75857f] mt-0.5">
                        Order #{delivery.order_id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pl-13 text-sm text-[#52615b]">
                    {delivery.delivery_method === "meetup" ? (
                      <>
                        <div className="flex items-center gap-2">
                          <MapPin size={15} className="text-gray-400" />
                          <span>
                            Location: <strong>{delivery.meetup_location || "Campus Main Gate"}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar size={15} className="text-gray-400" />
                          <span>Time: {formatDateTime(delivery.meetup_time)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Truck size={15} className="text-gray-400" />
                          <span>
                            Carrier: <strong>{delivery.carrier || "Courier Service"}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-gray-800">
                            Tracking: {delivery.tracking_number || "Pending"}
                          </span>
                        </div>
                        {delivery.shipping_address && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                            Address: {delivery.shipping_address}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="w-full flex flex-col items-center md:items-start space-y-1">
                  <span className="text-xs font-bold text-[#75857f] uppercase tracking-wider">
                    Fulfillment Status
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block size-2 rounded-full ${
                        delivery.status === "delivered"
                          ? "bg-[#3c8b72]"
                          : delivery.status === "cancelled"
                          ? "bg-red-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <span className="font-bold capitalize text-sm">
                      {delivery.status === "scheduled"
                        ? "Scheduled / Pending Handoff"
                        : delivery.status}
                    </span>
                  </div>
                </div>

                {/* Contextual Actions */}
                <div className="w-full flex flex-col items-stretch gap-2">
                  {/* BUYER ACTION: Show QR code to seller */}
                  {activeTab === "buyer" &&
                    delivery.status === "scheduled" &&
                    delivery.delivery_method === "meetup" && (
                      <button
                        onClick={() => setShowQrModalId(delivery.id)}
                        className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#173f36] text-white hover:bg-[#0f2c25] text-sm font-bold transition shadow-sm"
                        type="button"
                      >
                        <QrCode size={16} /> Show Handoff QR
                      </button>
                    )}

                  {/* SELLER ACTION: Verify buyer's code on meetup */}
                  {activeTab === "seller" &&
                    delivery.status === "scheduled" &&
                    delivery.delivery_method === "meetup" && (
                      <button
                        onClick={() => {
                          setVerifyingDeliveryId(delivery.id);
                          setVerificationError("");
                          setVerificationSuccess("");
                        }}
                        className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#3c8b72] hover:bg-[#effaf5] text-[#1f6653] text-sm font-bold transition"
                        type="button"
                      >
                        <ClipboardCheck size={16} /> Confirm Buyer Handoff
                      </button>
                    )}

                  {/* SELLER ACTION: Update shipping courier details */}
                  {activeTab === "seller" &&
                    delivery.delivery_method === "shipping" &&
                    delivery.status !== "delivered" &&
                    delivery.status !== "cancelled" && (
                      <button
                        onClick={() => {
                          setShippingModalDelivery(delivery);
                          setShippingCarrier(delivery.carrier || "SL Post Registered Mail");
                          setShippingTrackingNumber(delivery.tracking_number || "");
                          setShippingStatus(delivery.status || "shipped");
                          setShippingUpdateMsg("");
                        }}
                        className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-600 hover:bg-blue-50 text-blue-700 text-sm font-bold transition"
                        type="button"
                      >
                        <Truck size={16} /> Update Shipping Status
                      </button>
                    )}

                  {/* Common Completed/Cancelled Badge */}
                  {delivery.status === "delivered" ? (
                    <div className="inline-flex min-h-10 items-center justify-center gap-1.5 text-xs font-bold text-[#3c8b72] bg-[#effaf5] border border-[#cce7da] rounded-xl px-3 py-1">
                      <CheckCircle2 size={16} /> Trade Completed
                    </div>
                  ) : delivery.status === "cancelled" ? (
                    <div className="inline-flex min-h-10 items-center justify-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-1">
                      <ShieldAlert size={16} /> Cancelled / Refunded
                    </div>
                  ) : null}

                  {/* View Invoice button */}
                  <button
                    onClick={() => viewInvoice(delivery)}
                    className="w-full inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold transition"
                    type="button"
                  >
                    <FileText size={14} /> View Invoice
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: Buyer Displays Verification QR Code */}
      {showQrModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#d8e0dc] p-6 shadow-2xl relative page-enter text-center">
            <button
              onClick={() => setShowQrModalId(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2 mb-2">
              <QrCode className="text-[#2f6d5d]" /> Meetup Handoff QR
            </h2>
            <p className="text-xs text-[#52615b] leading-5 mb-5">
              Show this QR code or 6-character code to the seller when you meet on campus to verify item receipt.
            </p>

            {deliveries.find((d) => d.id === showQrModalId) && (
              <div className="flex flex-col items-center justify-center p-5 bg-gray-50 border border-gray-100 rounded-2xl mb-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${
                    deliveries.find((d) => d.id === showQrModalId).verification_code
                  }`}
                  alt="Handoff Verification QR Code"
                  className="size-36 border-4 border-white shadow-sm"
                />
                <span className="block mt-4 font-mono font-extrabold text-3xl tracking-[.18em] text-[#173f36]">
                  {deliveries.find((d) => d.id === showQrModalId).verification_code}
                </span>
                <span className="block mt-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                  Verification Code
                </span>
              </div>
            )}

            <button
              onClick={() => setShowQrModalId(null)}
              className="w-full min-h-11 bg-[#173f36] text-white rounded-xl font-bold text-sm transition hover:bg-[#0f2c25]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: Seller Verifies Buyer's Handoff Code */}
      {verifyingDeliveryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#d8e0dc] p-6 shadow-2xl relative page-enter">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
              <ClipboardCheck className="text-[#2f6d5d]" /> Verify Buyer Handoff
            </h2>
            <p className="text-xs text-[#52615b] leading-5 mb-5">
              Ask the buyer for their 6-character verification code from their app to confirm physical exchange and complete this sale.
            </p>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">
                  Buyer Verification Code
                </label>
                <input
                  type="text"
                  placeholder="Enter 6-char code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                  className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-center font-mono font-bold uppercase tracking-wider text-lg focus:border-[#3c8b72]"
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
                  onClick={() => setVerifyingDeliveryId(null)}
                  className="flex-1 min-h-11 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 text-sm transition"
                >
                  Cancel
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

      {/* MODAL 3: Seller Updates Shipping / Courier Tracking */}
      {shippingModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#d8e0dc] p-6 shadow-2xl relative page-enter">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Truck className="text-[#2f6d5d]" /> Update Parcel Shipping
            </h2>
            <p className="text-xs text-[#52615b] leading-5 mb-5">
              Enter courier partner details and tracking information for Order #{shippingModalDelivery.order_id.slice(0, 8)}.
            </p>

            <form onSubmit={handleUpdateShipping} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-1">
                  Courier Service / Carrier
                </label>
                <input
                  type="text"
                  value={shippingCarrier}
                  onChange={(e) => setShippingCarrier(e.target.value)}
                  placeholder="e.g. SL Post, Prompt Xpress, Koombiyo"
                  className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-1">
                  Waybill / Tracking Number
                </label>
                <input
                  type="text"
                  value={shippingTrackingNumber}
                  onChange={(e) => setShippingTrackingNumber(e.target.value)}
                  placeholder="e.g. SLP-998822-LK"
                  className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl font-mono text-sm focus:border-[#3c8b72]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-1">
                  Parcel Status
                </label>
                <select
                  value={shippingStatus}
                  onChange={(e) => setShippingStatus(e.target.value)}
                  className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                >
                  <option value="processing">Processing / Packing</option>
                  <option value="shipped">Shipped (Dispatched to Courier)</option>
                  <option value="in_transit">In Transit to Campus</option>
                  <option value="delivered">Delivered to Student</option>
                </select>
              </div>

              {shippingUpdateMsg && (
                <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl">
                  {shippingUpdateMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShippingModalDelivery(null)}
                  className="flex-1 min-h-11 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingShipping}
                  className="flex-1 min-h-11 bg-[#173f36] hover:bg-[#0f2c25] rounded-xl font-bold text-white text-sm transition disabled:opacity-50"
                >
                  {isUpdatingShipping ? "Updating..." : "Save Shipping Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Printable Student Invoice / Official Receipt */}
      {(invoiceData || loadingInvoice || invoiceError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-[#d8e0dc] p-6 sm:p-8 shadow-2xl relative page-enter max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setInvoiceData(null);
                setInvoiceError("");
              }}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-700"
            >
              <X size={20} />
            </button>

            {loadingInvoice ? (
              <div className="py-12 text-center">
                <LoaderCircle className="animate-spin mx-auto text-[#2f6d5d] mb-3" size={32} />
                <p className="text-sm font-semibold text-gray-600">Generating invoice details...</p>
              </div>
            ) : invoiceError ? (
              <div className="py-6 text-center text-red-600">
                <p className="text-sm font-semibold">{invoiceError}</p>
              </div>
            ) : invoiceData && (
              <div className="space-y-6">
                <div className="border-b border-gray-200 pb-4 flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-extrabold text-[#173f36]">UniSwap Official Receipt</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Student Peer-to-Peer Marketplace</p>
                  </div>
                  <span className="font-mono text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full font-bold uppercase">
                    {invoiceData.payment_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-400 block font-semibold">INVOICE NO:</span>
                    <span className="font-mono font-bold text-gray-800">{invoiceData.invoice_id}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">DATE:</span>
                    <span className="text-gray-800">{formatDateTime(invoiceData.issue_date)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">BUYER:</span>
                    <span className="text-gray-800">{invoiceData.buyer_email || invoiceData.buyer_id}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">PAYMENT METHOD:</span>
                    <span className="text-gray-800 uppercase font-semibold">{invoiceData.payment_method}</span>
                  </div>
                </div>

                <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 text-xs space-y-2">
                  <div className="flex justify-between font-bold text-gray-900 border-b border-gray-200 pb-2">
                    <span>Item Description</span>
                    <span>Total ({invoiceData.currency})</span>
                  </div>
                  <div className="flex justify-between text-gray-700 py-1">
                    <span>{invoiceData.item_title} (x{invoiceData.quantity})</span>
                    <span className="font-mono font-bold">{invoiceData.amount.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-sm text-[#173f36]">
                    <span>Grand Total:</span>
                    <span className="font-mono">{invoiceData.amount.toFixed(2)} {invoiceData.currency}</span>
                  </div>
                </div>

                {invoiceData.transaction_reference && (
                  <p className="text-[11px] font-mono text-gray-500">
                    Transaction Reference: {invoiceData.transaction_reference}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 min-h-11 inline-flex items-center justify-center gap-2 bg-[#173f36] hover:bg-[#0f2c25] text-white rounded-xl font-bold text-sm transition"
                  >
                    <Printer size={16} /> Print / Save PDF
                  </button>
                  <button
                    onClick={() => setInvoiceData(null)}
                    className="min-h-11 px-5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
