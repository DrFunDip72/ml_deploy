"use client";

import { useState } from "react";

type PredictionResponse = {
  modelVersion: string;
  prediction: {
    shipment_id: number;
    predicted_late_delivery: number;
    proba_late_delivery: number;
  } | null;
};

export default function PredictionExplorer() {
  const [shipmentId, setShipmentId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const id = Number(shipmentId);
      if (!Number.isFinite(id)) {
        throw new Error("Please enter a valid numeric shipment_id.");
      }

      const resp = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: id }),
      });

      const json = (await resp.json()) as PredictionResponse & { error?: string };
      if (!resp.ok) {
        throw new Error(json.error ?? "Prediction request failed.");
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-foreground/20 bg-foreground/5 p-4">
      <h2 className="font-medium">Prediction Explorer</h2>
      <p className="mt-1 text-sm text-foreground/70">
        Look up the latest-model probability for a specific `shipment_id`.
      </p>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">shipment_id</span>
          <input
            className="h-10 rounded-md border border-foreground/20 bg-background px-3 text-sm"
            value={shipmentId}
            onChange={(e) => setShipmentId(e.target.value)}
            placeholder="e.g., 1234"
            inputMode="numeric"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-foreground px-4 text-background disabled:opacity-60"
          disabled={loading}
          onClick={onSubmit}
        >
          {loading ? "Looking up..." : "Lookup"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      ) : null}

      {result ? (
        <div className="mt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-foreground/70">Model</span>
            <span className="font-medium">{result.modelVersion}</span>
          </div>
          <div className="mt-2">
            {result.prediction ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Predicted class</span>
                  <span className="font-medium">
                    {result.prediction.predicted_late_delivery}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Probability (late)</span>
                  <span className="font-medium">
                    {Number(result.prediction.proba_late_delivery).toFixed(4)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-foreground/70">
                No prediction found for that `shipment_id`.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

