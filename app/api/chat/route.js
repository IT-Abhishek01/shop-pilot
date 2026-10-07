import { GoogleGenAI } from "@google/genai";
import { supabase } from "@/lib/supabase";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const tools = [
  {
    functionDeclarations: [
      {
        name: "add_to_cart",
        description:
          "Request adding a product from the store inventory to the customer's cart.",
        parameters: {
          type: "OBJECT",
          properties: {
            productId: {
              type: "INTEGER",
              description: "The ID of the product to add to the cart.",
            },
          },
          required: ["productId"],
        },
      },
      {
        name: "get_order_status",
        description:
          "Get the current status of a customer's order using the order ID.",
        parameters: {
          type: "OBJECT",
          properties: {
            orderId: {
              type: "INTEGER",
              description: "The unique ID of the order.",
            },
          },
          required: ["orderId"],
        },
      },
      {
        name: "get_policy",
        description:
          "Get the store's return, refund, and policy information.",
        parameters: {
          type: "OBJECT",
          properties: {
            policyType: {
              type: "STRING",
              description:
                "The policy type such as return, refund, or shipping.",
            },
          },
          required: ["policyType"],
        },
      },
    ],
  },
];

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.message || typeof body.message !== "string") {
      return Response.json(
        { error: "A message is required." },
        { status: 400 }
      );
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, brand, category, price, product_url");

    if (productsError) {
      console.error("PRODUCT FETCH ERROR:", productsError);

      return Response.json(
        { error: "Could not load store products." },
        { status: 500 }
      );
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",

        contents: `
You are ShopPilot, an AI shopping assistant.

Rules:
- Recommend ONLY products from the inventory below.
- Never invent product names, prices, IDs, or links.
- Use exact product information from the inventory.
- Keep replies friendly and concise.
- When the customer explicitly asks to add a product to cart, use add_to_cart.
- When the customer asks about order status, use get_order_status.
- When the customer asks about returns, refunds, or policies, use get_policy.
- Never claim an item was added unless the application confirms it.
- If no matching product exists, say so.

STORE INVENTORY:
${JSON.stringify(products || [], null, 2)}

CUSTOMER MESSAGE:
${body.message}
        `,

        config: {
          tools,
        },
      });

      return Response.json({
        message: response.text || "",
        functionCalls: response.functionCalls || [],
      });
    } catch (aiError) {
      console.error("GEMINI ERROR:", aiError);

      const status = Number(aiError?.status || 500);

      const errorText = String(
        aiError?.message || ""
      ).toLowerCase();

      // Do NOT retry quota errors.
      if (
        status === 429 ||
        errorText.includes("quota") ||
        errorText.includes("resource_exhausted")
      ) {
        return Response.json(
          {
            error:
              "AI quota temporarily unavailable. Local product search is still available.",
            code: "AI_QUOTA",
          },
          { status: 429 }
        );
      }

      if (status === 503 || status >= 500) {
        return Response.json(
          {
            error:
              "The AI service is temporarily unavailable. Please try again.",
            code: "AI_TEMPORARY_ERROR",
          },
          { status: 503 }
        );
      }

      return Response.json(
        {
          error:
            aiError?.message ||
            "The AI assistant could not process your request.",
          code: "AI_ERROR",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("CHAT API ERROR:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "Something went wrong while processing your request.",
      },
      { status: 500 }
    );
  }
}