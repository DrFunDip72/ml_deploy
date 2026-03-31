import { NextResponse } from "next/server";
import { hasValidAdminPasscode } from "@/lib/demoAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getPasscode(request: Request) {
  const url = new URL(request.url);
  return request.headers.get("x-admin-passcode") ?? url.searchParams.get("passcode");
}

export async function GET(request: Request) {
  const passcode = getPasscode(request);
  if (!hasValidAdminPasscode(passcode)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServerClient();

    const { data: latestModel, error: modelErr } = await supabase
      .from("model_registry")
      .select("model_version")
      .eq("label_col", "is_fraud")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (modelErr) {
      return NextResponse.json({ error: modelErr.message }, { status: 500 });
    }

    const { data: orders, error: orderErr } = await supabase
      .from("orders")
      .select("order_id,customer_id,order_datetime,order_total,is_fraud")
      .order("order_datetime", { ascending: false })
      .limit(250);

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }

    const customerIds = Array.from(new Set((orders ?? []).map((o) => o.customer_id)));
    const orderIds = (orders ?? []).map((o) => o.order_id);

    const { data: customers, error: customerErr } = await supabase
      .from("customers")
      .select("customer_id,full_name,email")
      .in("customer_id", customerIds.length > 0 ? customerIds : [-1]);

    if (customerErr) {
      return NextResponse.json({ error: customerErr.message }, { status: 500 });
    }

    const customerMap = new Map(
      (customers ?? []).map((c) => [c.customer_id as number, c]),
    );

    let predictionMap = new Map<number, { score: number; predictedClass: number }>();
    if (latestModel?.model_version && orderIds.length > 0) {
      const { data: preds, error: predErr } = await supabase
        .from("predictions")
        .select("order_id,predicted_is_fraud,proba_is_fraud")
        .eq("model_version", latestModel.model_version)
        .in("order_id", orderIds);

      if (predErr) {
        return NextResponse.json({ error: predErr.message }, { status: 500 });
      }

      predictionMap = new Map(
        (preds ?? []).map((p) => [
          p.order_id as number,
          {
            score: Number(p.proba_is_fraud),
            predictedClass: Number(p.predicted_is_fraud),
          },
        ]),
      );
    }

    const rows = (orders ?? []).map((order) => {
      const customer = customerMap.get(order.customer_id as number);
      const pred = predictionMap.get(order.order_id as number);

      return {
        ...order,
        full_name: customer?.full_name ?? null,
        email: customer?.email ?? null,
        predicted_is_fraud: pred?.predictedClass ?? null,
        fraud_score: pred?.score ?? null,
      };
    });

    return NextResponse.json({
      modelVersion: latestModel?.model_version ?? null,
      orders: rows,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load admin order list.",
      },
      { status: 500 },
    );
  }
}
