import { supabase } from "@/lib/supabase";

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      customerName,
      customerEmail,
      totalAmount,
    } = body;

    if (!customerName || !customerEmail || totalAmount == null) {
      return Response.json(
        { error: "Customer name, email, and total amount are required." },
        { status: 400 }
      );
    }

    const { data: order, error } = await supabase
      .from("orders")
      .insert([
        {
          customer_name: customerName,
          customer_email: customerEmail,
          total_amount: totalAmount,
          status: "confirmed",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("CREATE ORDER ERROR:", error);

      return Response.json(
        { error: "Could not create the order." },
        { status: 500 }
      );
    }

    return Response.json({ order }, { status: 201 });
  } catch (error) {
    console.error("ORDER API ERROR:", error);

    return Response.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}