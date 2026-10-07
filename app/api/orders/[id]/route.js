import { supabase } from "@/lib/supabase";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const orderId = Number(id);

    if (!Number.isInteger(orderId)) {
      return Response.json(
        { error: "Invalid order ID." },
        { status: 400 }
      );
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, customer_name, customer_email, total_amount, status, created_at")
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("ORDER LOOKUP ERROR:", error);

      return Response.json(
        { error: "Order not found." },
        { status: 404 }
      );
    }

    return Response.json({ order });
  } catch (error) {
    console.error("ORDER API ERROR:", error);

    return Response.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}