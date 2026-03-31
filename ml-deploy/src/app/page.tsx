"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type CustomerOrder = {
  order_id: number;
  order_datetime: string;
  payment_method: string | null;
  order_total: number | null;
  is_fraud: number | null;
  predicted_is_fraud: number | null;
  fraud_score: number | null;
};

type OrderListResponse = {
  modelVersion: string | null;
  orders: CustomerOrder[];
};

export default function Page() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [orderTotal, setOrderTotal] = useState("");
  const [promoCode, setPromoCode] = useState("");

  const [lookupEmail, setLookupEmail] = useState("");
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadOrders(emailValue: string) {
    const resp = await fetch(`/api/orders?email=${encodeURIComponent(emailValue)}`);
    const json = (await resp.json()) as OrderListResponse & { error?: string };
    if (!resp.ok) {
      throw new Error(json.error ?? "Failed to load orders.");
    }
    setModelVersion(json.modelVersion);
    setOrders(json.orders);
  }

  async function onCreateOrder(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const total = Number(orderTotal);
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error("Order total must be a positive number.");
      }

      const resp = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          payment_method: paymentMethod,
          promo_code: promoCode || null,
          order_total: total,
        }),
      });

      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        throw new Error(json.error ?? "Failed to create order.");
      }

      setNotice("Order placed successfully.");
      setLookupEmail(email);
      await loadOrders(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order.");
    } finally {
      setLoading(false);
    }
  }

  async function onLookupOrders(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await loadOrders(lookupEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-3xl font-semibold">Fraud Demo Storefront</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Place an order, then view your order history and fraud predictions.
        </p>
      </header>

      <section className="rounded-lg border border-foreground/15 p-4">
        <h2 className="text-xl font-medium">Place Order</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onCreateOrder}>
          <input
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="card">Card</option>
            <option value="paypal">PayPal</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
          <input
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            placeholder="Order total"
            inputMode="decimal"
            value={orderTotal}
            onChange={(e) => setOrderTotal(e.target.value)}
            required
          />
          <input
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2 md:col-span-2"
            placeholder="Promo code (optional)"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-70 md:col-span-2"
            disabled={loading}
          >
            {loading ? "Submitting..." : "Place order"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-foreground/15 p-4">
        <h2 className="text-xl font-medium">View My Orders</h2>
        <form className="mt-4 flex gap-3" onSubmit={onLookupOrders}>
          <input
            className="flex-1 rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            placeholder="Enter customer email"
            type="email"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            required
          />
          <button
            type="submit"
            className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-70"
            disabled={loading}
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </form>

        {modelVersion ? (
          <p className="mt-3 text-xs text-foreground/70">Model version: {modelVersion}</p>
        ) : null}

        {orders.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-foreground/70">
                <tr>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Placed At</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Fraud Score</th>
                  <th className="py-2 pr-4">Predicted Fraud</th>
                  <th className="py-2 pr-4">Actual Fraud Label</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.order_id} className="border-t border-foreground/10">
                    <td className="py-2 pr-4">{order.order_id}</td>
                    <td className="py-2 pr-4">{order.order_datetime ?? "-"}</td>
                    <td className="py-2 pr-4">
                      {order.order_total != null ? Number(order.order_total).toFixed(2) : "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {order.fraud_score != null ? order.fraud_score.toFixed(4) : "Pending model score"}
                    </td>
                    <td className="py-2 pr-4">
                      {order.predicted_is_fraud == null ? "-" : String(order.predicted_is_fraud)}
                    </td>
                    <td className="py-2 pr-4">
                      {order.is_fraud == null ? "Not reviewed" : String(order.is_fraud)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-foreground/70">
            No orders loaded yet. Enter an email to view order history.
          </p>
        )}
      </section>

      {notice ? <p className="text-sm text-green-600">{notice}</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Link className="text-sm underline" href="/admin">
        Go to admin review
      </Link>
    </main>
  );
}
