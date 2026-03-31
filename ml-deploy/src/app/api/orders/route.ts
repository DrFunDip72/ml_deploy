import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function toOrderTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "email is required as a query parameter." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServerClient();

    const { data: latestModel } = await supabase
      .from("model_registry")
      .select("model_version")
      .eq("label_col", "is_fraud")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: customers, error: customerErr } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("email", email);

    if (customerErr) {
      return NextResponse.json({ error: customerErr.message }, { status: 500 });
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({ modelVersion: latestModel?.model_version ?? null, orders: [] });
    }

    const customerIds = customers.map((c) => c.customer_id);
    const { data: orders, error: orderErr } = await supabase
      .from("orders")
      .select(
        "order_id,customer_id,order_datetime,payment_method,order_total,risk_score,is_fraud",
      )
      .in("customer_id", customerIds)
      .order("order_datetime", { ascending: false });

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }

    const orderIds = (orders ?? []).map((o) => o.order_id);
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

    const enriched = (orders ?? []).map((order) => {
      const pred = predictionMap.get(order.order_id);
      return {
        ...order,
        predicted_is_fraud: pred?.predictedClass ?? null,
        fraud_score: pred?.score ?? null,
      };
    });

    return NextResponse.json({
      modelVersion: latestModel?.model_version ?? null,
      orders: enriched,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    payment_method?: string;
    device_type?: string;
    ip_country?: string;
    promo_code?: string | null;
    order_total?: number;
  };

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const orderTotal = Number(body.order_total ?? 0);

  if (!fullName || !email || !Number.isFinite(orderTotal) || orderTotal <= 0) {
    return NextResponse.json(
      { error: "full_name, email, and a positive order_total are required." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServerClient();

    const { data: existingCustomer, error: existingCustomerErr } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (existingCustomerErr) {
      return NextResponse.json(
        { error: existingCustomerErr.message },
        { status: 500 },
      );
    }

    let customerId = existingCustomer?.customer_id as number | undefined;

    if (!customerId) {
      const { data: latestCustomer, error: latestCustomerErr } = await supabase
        .from("customers")
        .select("customer_id")
        .order("customer_id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestCustomerErr) {
        return NextResponse.json({ error: latestCustomerErr.message }, { status: 500 });
      }

      customerId = Number(latestCustomer?.customer_id ?? 0) + 1;
      const nowIso = new Date().toISOString();

      const { error: createCustomerErr } = await supabase.from("customers").insert({
        customer_id: customerId,
        full_name: fullName,
        email,
        created_at: nowIso,
        is_active: 1,
      });

      if (createCustomerErr) {
        return NextResponse.json({ error: createCustomerErr.message }, { status: 500 });
      }
    }

    const { data: latestOrder, error: latestOrderErr } = await supabase
      .from("orders")
      .select("order_id")
      .order("order_id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOrderErr) {
      return NextResponse.json({ error: latestOrderErr.message }, { status: 500 });
    }

    const nextOrderId = Number(latestOrder?.order_id ?? 0) + 1;
    const now = new Date();
    const orderDatetime = toOrderTimestamp(now);

    const { data: insertedOrder, error: insertOrderErr } = await supabase
      .from("orders")
      .insert({
        order_id: nextOrderId,
        customer_id: customerId,
        order_datetime: orderDatetime,
        payment_method: body.payment_method ?? "card",
        device_type: body.device_type ?? "web",
        ip_country: body.ip_country ?? "US",
        promo_used: body.promo_code ? 1 : 0,
        promo_code: body.promo_code ?? null,
        order_subtotal: orderTotal,
        shipping_fee: 0,
        tax_amount: 0,
        order_total: orderTotal,
        risk_score: null,
        is_fraud: null,
      })
      .select("order_id,customer_id,order_datetime,payment_method,order_total,is_fraud")
      .single();

    if (insertOrderErr) {
      return NextResponse.json({ error: insertOrderErr.message }, { status: 500 });
    }

    return NextResponse.json({ order: insertedOrder }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create order." },
      { status: 500 },
    );
  }
}
