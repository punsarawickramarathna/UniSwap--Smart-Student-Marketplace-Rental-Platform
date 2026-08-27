import { useState } from "react";
import { ArrowLeft, CreditCard, DollarSign, MapPin, Truck, Calendar, ShoppingBag, ShieldCheck } from "lucide-react";
import { handleAppLink, navigate } from "../navigation";
import api from "../services/api";

const MOCK_ITEMS = [
  { id: 1, name: "Apple iPad Air M2 (128GB)", price: 599.00, category: "Electronics" },
  { id: 2, name: "Calculus: Early Transcendentals (8th Ed)", price: 45.00, category: "Textbooks" },
  { id: 3, name: "Texas Instruments TI-84 Plus Calculator", price: 85.00, category: "Electronics" },
];

export default function CheckoutPage() {
  const [selectedItem, setSelectedItem] = useState(MOCK_ITEMS[1]); // Default to Calculus book
  const [deliveryMethod, setDeliveryMethod] = useState("meetup"); // meetup or shipping
  const [paymentMethod, setPaymentMethod] = useState("stripe"); // stripe or cash_on_meetup

  // Form states
  const [meetupLocation, setMeetupLocation] = useState("Main Library Lobby");
  const [customLocation, setCustomLocation] = useState("");
  const [meetupDate, setMeetupDate] = useState("");
  const [meetupTime, setMeetupTime] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  
  // Card states
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const deliveryFee = deliveryMethod === "shipping" ? 5.00 : 0.00;
  const totalAmount = selectedItem.price + deliveryFee;

  async function handleCheckout(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const finalLocation = meetupLocation === "Custom Location" ? customLocation : meetupLocation;
    let meetupIsoTime = null;
    
    if (deliveryMethod === "meetup") {
      if (!meetupDate || !meetupTime) {
        setError("Please select both a date and a time for the campus meetup.");
        setIsSubmitting(false);
        return;
      }
      meetupIsoTime = new Date(`${meetupDate}T${meetupTime}`).toISOString();
    }

    try {
      const response = await api.post("/payment-delivery/checkout", {
        amount: totalAmount,
        payment_method: paymentMethod,
        delivery_method: deliveryMethod,
        meetup_location: deliveryMethod === "meetup" ? finalLocation : null,
        meetup_time: deliveryMethod === "meetup" ? meetupIsoTime : null,
      });

      const { payment_url, payment_id } = response.data;

      if (paymentMethod === "stripe") {
        // Simulate Stripe Checkout redirection
        navigate(payment_url || `/payment-success?payment_id=${payment_id}`);
      } else {
        // Cash on Meetup -> Navigate directly to delivery tracking
        navigate("/deliveries");
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || "Failed to process checkout. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-[#13201c]">
      <header className="flex h-16 items-center justify-between border-b border-[#d8e0dc] bg-white px-5 sm:px-8">
        <a className="flex items-center gap-3 font-semibold" href="/" onClick={handleAppLink("/")}>
          <span className="grid size-9 place-items-center rounded-xl bg-[#173f36] text-white">
            <ShoppingBag aria-hidden="true" size={19} />
          </span>
          UniSwap
        </a>
        <div className="flex items-center gap-3">
          <a className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#2f6d5d] transition hover:bg-[#eaf2ee]" href="/deliveries" onClick={handleAppLink("/deliveries")}>
            My Deliveries
          </a>
          <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cbd5d0] px-4 py-2 text-sm font-semibold text-[#173f36] transition hover:bg-[#eaf2ee]" href="/" onClick={handleAppLink("/")}>
            <ArrowLeft size={16} /> Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10 page-enter">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
          <p className="mt-2 text-sm text-[#52615b]">Securely purchase items using Student Marketplace services.</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <form className="space-y-6" onSubmit={handleCheckout}>
            {/* Step 1: Select Item */}
            <div className="rounded-2xl border border-[#d8e0dc] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold flex items-center gap-2 text-[#173f36] mb-4">
                <ShoppingBag size={18} /> 1. Select Demo Item
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {MOCK_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition ${
                      selectedItem.id === item.id
                        ? "border-[#3c8b72] bg-[#effaf5] ring-2 ring-[#3c8b72]/20"
                        : "border-[#cbd5d0] bg-white hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xs uppercase tracking-wider text-[#52615b] font-semibold">{item.category}</span>
                    <span className="mt-1 text-sm font-bold text-gray-900 line-clamp-1">{item.name}</span>
                    <span className="mt-2 text-base font-extrabold text-[#173f36]">${item.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Delivery Option */}
            <div className="rounded-2xl border border-[#d8e0dc] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold flex items-center gap-2 text-[#173f36] mb-4">
                <Truck size={18} /> 2. Handoff & Delivery Method
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDeliveryMethod("meetup")}
                  className={`flex items-start gap-4 p-4 rounded-xl border text-left transition ${
                    deliveryMethod === "meetup"
                      ? "border-[#3c8b72] bg-[#effaf5]"
                      : "border-[#cbd5d0] bg-white hover:bg-gray-50"
                  }`}
                >
                  <MapPin className="text-[#2f6d5d] mt-1 shrink-0" size={20} />
                  <div>
                    <span className="block text-sm font-bold">Campus Meetup</span>
                    <span className="block mt-1 text-xs text-[#52615b]">Meet the seller physically in a safe university zone. (Free)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryMethod("shipping")}
                  className={`flex items-start gap-4 p-4 rounded-xl border text-left transition ${
                    deliveryMethod === "shipping"
                      ? "border-[#3c8b72] bg-[#effaf5]"
                      : "border-[#cbd5d0] bg-white hover:bg-gray-50"
                  }`}
                >
                  <Truck className="text-[#2f6d5d] mt-1 shrink-0" size={20} />
                  <div>
                    <span className="block text-sm font-bold">Standard Shipping</span>
                    <span className="block mt-1 text-xs text-[#52615b]">Deliver to your hostel or address via postal service. (+$5.00)</span>
                  </div>
                </button>
              </div>

              {/* Delivery Details inputs */}
              {deliveryMethod === "meetup" ? (
                <div className="mt-6 space-y-4 border-t border-[#f0f4f2] pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Meetup Location</label>
                      <select
                        value={meetupLocation}
                        onChange={(e) => setMeetupLocation(e.target.value)}
                        className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72] focus:ring-1 focus:ring-[#3c8b72]"
                      >
                        <option value="Main Library Lobby">Main Library Lobby</option>
                        <option value="Student Union Center">Student Union Center</option>
                        <option value="Engineering Gym Gate">Engineering Gym Gate</option>
                        <option value="Science Faculty Canteen">Science Faculty Canteen</option>
                        <option value="Custom Location">Custom Location (Write below)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Meetup Date</label>
                      <input
                        type="date"
                        value={meetupDate}
                        onChange={(e) => setMeetupDate(e.target.value)}
                        className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {meetupLocation === "Custom Location" && (
                      <div>
                        <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Specify Location</label>
                        <input
                          type="text"
                          placeholder="e.g. Near ICT Lab back entrance"
                          value={customLocation}
                          onChange={(e) => setCustomLocation(e.target.value)}
                          className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                          required
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Meetup Time</label>
                      <input
                        type="time"
                        value={meetupTime}
                        onChange={(e) => setMeetupTime(e.target.value)}
                        className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 border-t border-[#f0f4f2] pt-4">
                  <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Shipping Address</label>
                  <textarea
                    rows={2}
                    placeholder="Enter your university hostel, block number, or off-campus residence address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full p-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                    required
                  ></textarea>
                </div>
              )}
            </div>

            {/* Step 3: Payment Method */}
            <div className="rounded-2xl border border-[#d8e0dc] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold flex items-center gap-2 text-[#173f36] mb-4">
                <CreditCard size={18} /> 3. Payment Method
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("stripe")}
                  className={`flex items-start gap-4 p-4 rounded-xl border text-left transition ${
                    paymentMethod === "stripe"
                      ? "border-[#3c8b72] bg-[#effaf5]"
                      : "border-[#cbd5d0] bg-white hover:bg-gray-50"
                  }`}
                >
                  <CreditCard className="text-[#2f6d5d] mt-1 shrink-0" size={20} />
                  <div>
                    <span className="block text-sm font-bold">Online Card (Stripe)</span>
                    <span className="block mt-1 text-xs text-[#52615b]">Secure online checkout using visa, mastercard, or online banking.</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash_on_meetup")}
                  className={`flex items-start gap-4 p-4 rounded-xl border text-left transition ${
                    paymentMethod === "cash_on_meetup"
                      ? "border-[#3c8b72] bg-[#effaf5]"
                      : "border-[#cbd5d0] bg-white hover:bg-gray-50"
                  }`}
                >
                  <DollarSign className="text-[#2f6d5d] mt-1 shrink-0" size={20} />
                  <div>
                    <span className="block text-sm font-bold">Cash on Meetup</span>
                    <span className="block mt-1 text-xs text-[#52615b]">Pay in cash physically when you inspect and collect the item.</span>
                  </div>
                </button>
              </div>

              {/* Payment Details Input */}
              {paymentMethod === "stripe" ? (
                <div className="mt-6 border-t border-[#f0f4f2] pt-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#2f6d5d] bg-[#effaf5] border border-[#cce7da] p-3 rounded-xl mb-4">
                    <ShieldCheck size={16} /> Secure Payment Demo Mode (Enter any dummy card details below)
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Card Number</label>
                    <input
                      type="text"
                      placeholder="4242 •••• •••• 4242"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16))}
                      className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                      required={paymentMethod === "stripe"}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value.slice(0, 5))}
                        className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                        required={paymentMethod === "stripe"}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#52615b] uppercase tracking-wider mb-2">CVC</label>
                      <input
                        type="text"
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        className="w-full h-11 px-3 border border-[#cbd5d0] bg-white rounded-xl text-sm focus:border-[#3c8b72]"
                        required={paymentMethod === "stripe"}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 border-t border-[#f0f4f2] pt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-sm leading-6 text-[#52615b]">
                    You selected **Cash on Meetup**. You are not required to enter payment card details. When you meet the seller on campus, inspect the item first. After confirming everything is correct, give cash and exchange the meetup validation code to complete the trade.
                  </p>
                </div>
              )}
            </div>
          </form>

          {/* Right Panel: Summary */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#d8e0dc] bg-white p-6 shadow-sm sticky top-6">
              <h2 className="text-lg font-bold text-[#173f36] mb-4">Order Summary</h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-start pb-4 border-b border-gray-100">
                  <div>
                    <p className="font-bold text-gray-900">{selectedItem.name}</p>
                    <p className="text-xs text-[#52615b] mt-0.5">{selectedItem.category}</p>
                  </div>
                  <p className="font-bold text-[#173f36]">${selectedItem.price.toFixed(2)}</p>
                </div>

                <div className="space-y-2 text-sm text-[#52615b]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>${selectedItem.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery / Pickup</span>
                    <span>{deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200 text-lg font-extrabold text-[#173f36]">
                  <span>Total Due</span>
                  <span>${totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isSubmitting}
                className="w-full mt-6 flex min-h-12 items-center justify-center rounded-xl bg-[#173f36] text-white font-bold transition hover:bg-[#0f2c25] disabled:opacity-50"
              >
                {isSubmitting ? "Processing Handoff..." : `Checkout • $${totalAmount.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
