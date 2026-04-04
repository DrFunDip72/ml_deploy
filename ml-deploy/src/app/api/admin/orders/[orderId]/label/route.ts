import { NextResponse } from "next/server";
import { hasValidAdminPasscode } from "@/lib/demoAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getPasscode(request: Request) {
  const url = new URL(request.url);
  return request.headers.get("x-admin-passcode") ?? url.searchParams.get("passcode");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const passcode = getPasscode(request);
  if (!hasValidAdminPasscode(passcode)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { orderId } = await context.params;
  const parsedOrderId = Number(orderId);
  if (!Number.isFinite(parsedOrderId)) {
    return NextResponse.json({ error: "Invalid orderId." }, { status: 400 });
  }

  const body = (await request.json()) as { is_fraud?: number | boolean };
  const labelNum = Number(body.is_fraud);
  if (![0, 1].includes(labelNum)) {
    return NextResponse.json(
      { error: "is_fraud must be 0 or 1." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("orders")
      .update({ is_fraud: labelNum })
      .eq("order_id", parsedOrderId)
      .select("order_id,is_fraud")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const { error: syncErr } = await supabase.rpc("sync_warehouse_for_order", {
      p_order_id: parsedOrderId,
    });

    return NextResponse.json({
      order: data,
      warehouseSyncError: syncErr?.message ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update label." },
      { status: 500 },
    );
  }
}
