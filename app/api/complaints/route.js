import { supabase } from "@/lib/supabase";

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      customerName,
      customerEmail,
      message,
    } = body;

    if (!message?.trim()) {
      return Response.json(
        { error: "Complaint message is required." },
        { status: 400 }
      );
    }

    const { data: complaint, error } = await supabase
      .from("complaints")
      .insert([
        {
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          message: message.trim(),
          status: "assigned to human",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("CREATE COMPLAINT ERROR:", error);

      return Response.json(
        { error: "Could not create complaint." },
        { status: 500 }
      );
    }

    return Response.json(
      { complaint },
      { status: 201 }
    );
  } catch (error) {
    console.error("COMPLAINT API ERROR:", error);

    return Response.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Complaint ID is required." },
        { status: 400 }
      );
    }

    const { data: complaint, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return Response.json(
        { error: "Complaint not found." },
        { status: 404 }
      );
    }

    return Response.json({ complaint });
  } catch (error) {
    console.error("GET COMPLAINT ERROR:", error);

    return Response.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}