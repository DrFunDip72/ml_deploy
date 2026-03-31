import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 200);

  try {
    const supabase = createSupabaseServerClient();

    const { data: latestModel, error: modelErr } = await supabase
      .from("model_registry")
      .select("*")
      .eq("label_col", "is_fraud")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (modelErr) {
      return NextResponse.json(
        { error: modelErr.message },
        { status: 500 },
      );
    }

    if (!latestModel) {
      return NextResponse.json({ modelVersion: null, predictions: [] });
    }

    const modelVersion = latestModel.model_version as string;
    const metrics = latestModel.metrics_json as Record<string, unknown> | null;

    const { data: preds, error: predsErr } = await supabase
      .from("predictions")
      .select("order_id,predicted_is_fraud,proba_is_fraud")
      .eq("model_version", modelVersion)
      .order("proba_is_fraud", { ascending: false })
      .limit(limit);

    if (predsErr) {
      return NextResponse.json(
        { error: predsErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      modelVersion,
      metrics,
      predictions: preds ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load predictions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { order_id } = (await request.json()) as {
    order_id?: number | string;
  };

  if (order_id === undefined || order_id === null) {
    return NextResponse.json(
      { error: "Missing order_id in request body." },
      { status: 400 },
    );
  }

  const orderIdNum = Number(order_id);
  if (!Number.isFinite(orderIdNum)) {
    return NextResponse.json(
      { error: "order_id must be a number." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServerClient();

    const { data: latestModel, error: modelErr } = await supabase
      .from("model_registry")
      .select("model_version")
      .eq("label_col", "is_fraud")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (modelErr) {
      return NextResponse.json(
        { error: modelErr.message },
        { status: 500 },
      );
    }

    if (!latestModel) {
      return NextResponse.json(
        { error: "No model_version found." },
        { status: 404 },
      );
    }

    const modelVersion = latestModel.model_version as string;

    const { data: pred, error: predErr } = await supabase
      .from("predictions")
      .select("order_id,predicted_is_fraud,proba_is_fraud")
      .eq("model_version", modelVersion)
      .eq("order_id", orderIdNum)
      .maybeSingle();

    if (predErr) {
      return NextResponse.json(
        { error: predErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ modelVersion, prediction: pred ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Prediction lookup failed." },
      { status: 500 },
    );
  }
}

