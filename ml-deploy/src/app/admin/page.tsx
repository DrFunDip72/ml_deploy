"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type AdminOrder = {
  order_id: number;
  order_datetime: string | null;
  order_total: number | null;
  is_fraud: number | null;
  full_name: string | null;
  email: string | null;
  predicted_is_fraud: number | null;
  fraud_score: number | null;
};

type AdminOrdersResponse = {
  modelVersion: string | null;
  orders: AdminOrder[];
};

export default function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadOrders(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch(
        `/api/admin/orders?passcode=${encodeURIComponent(passcode)}`,
      );
      const json = (await resp.json()) as AdminOrdersResponse & { error?: string };
      if (!resp.ok) {
        throw new Error(json.error ?? "Failed to load admin orders.");
      }

      setModelVersion(json.modelVersion);
      setOrders(json.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin orders.");
    } finally {
      setLoading(false);
    }
  }

  async function setFraudLabel(orderId: number, value: 0 | 1) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch(`/api/admin/orders/${orderId}/label`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-passcode": passcode,
        },
        body: JSON.stringify({ is_fraud: value }),
      });

      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        throw new Error(json.error ?? "Failed to update fraud label.");
      }

      setOrders((current) =>
        current.map((row) =>
          row.order_id === orderId ? { ...row, is_fraud: value } : row,
        ),
      );
      setNotice(`Updated order ${orderId} with is_fraud=${value}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update fraud label.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-semibold">Admin Fraud Review</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Review orders, inspect fraud scores, and mark the final fraud label.
        </p>
      </header>

      <form className="flex gap-3" onSubmit={loadOrders}>
        <input
          className="w-full max-w-sm rounded-md border border-foreground/20 bg-transparent px-3 py-2"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Admin passcode"
          type="password"
          required
        />
        <button
          type="submit"
          className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Loading..." : "Load orders"}
        </button>
      </form>

      {modelVersion ? (
        <p className="text-xs text-foreground/70">Model version: {modelVersion}</p>
      ) : null}

      {orders.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-foreground/15">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-foreground/5 text-foreground/70">
              <tr>
                <th className="py-2 pl-3 pr-4">Order</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Fraud Score</th>
                <th className="py-2 pr-4">Predicted</th>
                <th className="py-2 pr-4">Actual</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.order_id} className="border-t border-foreground/10">
                  <td className="py-2 pl-3 pr-4">{order.order_id}</td>
                  <td className="py-2 pr-4">{order.full_name ?? "-"}</td>
                  <td className="py-2 pr-4">{order.email ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {order.order_total != null ? order.order_total.toFixed(2) : "-"}
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
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button
                        className="rounded-md border border-foreground/20 px-2 py-1 text-xs"
                        onClick={() => setFraudLabel(order.order_id, 1)}
                        disabled={loading}
                        type="button"
                      >
                        Mark Fraud
                      </button>
                      <button
                        className="rounded-md border border-foreground/20 px-2 py-1 text-xs"
                        onClick={() => setFraudLabel(order.order_id, 0)}
                        disabled={loading}
                        type="button"
                      >
                        Mark Clean
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-foreground/70">No orders loaded yet.</p>
      )}

      {notice ? <p className="text-sm text-green-600">{notice}</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Link className="text-sm underline" href="/">
        Back to customer view
      </Link>
    </main>
  );
}
