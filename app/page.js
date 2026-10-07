"use client";

import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

import {
  searchProducts,
  extractMaxPrice,
  extractKeyword,
} from "./searchProduct";

const RETURN_POLICY =
  "Our return policy allows customers to request a return within 7 days of delivery. Products must be unused and in their original condition. Refunds are processed after the returned product is received and verified.";

export default function Home() {
  // ================= STATE =================

  const [message, setMessage] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [results, setResults] = useState([]);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [chatLoading, setChatLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [cart, setCart] = useState([]);

  const [checkout, setCheckout] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Human support
  const [complaint, setComplaint] = useState(null);
  const [showHumanHandoff, setShowHumanHandoff] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState("");

  // Order tracking
  const [showOrderInput, setShowOrderInput] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState(null);

  const [mobileMenu, setMobileMenu] = useState(false);

  // ================= NAVIGATION =================

  function scrollToSection(id) {
    setMobileMenu(false);

    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function goHome() {
    setMobileMenu(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openCart() {
    setMobileMenu(false);

    if (cart.length === 0) {
      setErrorMessage("Your cart is empty. Add a product first.");
      scrollToSection("products");
      return;
    }

    setErrorMessage("");
    setCheckout(false);
    scrollToSection("cart");
  }

  function openOrders() {
    setTrackedOrder(null);
    setShowOrderInput(true);
    setOrderId("");
    setErrorMessage("");
    setAssistantReply("");

    scrollToSection("order-tracking");
  }

  function openHelp() {
    setShowHumanHandoff(true);
    setErrorMessage("");

    scrollToSection("support");
  }

  // ================= LOAD PRODUCTS =================

  useEffect(() => {
    async function loadProducts() {
      try {
        setProductsLoading(true);

        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("id", { ascending: true });

        if (error) throw error;

        setProducts(data || []);
      } catch (error) {
        console.error("PRODUCT LOAD ERROR:", error);
        setErrorMessage("Unable to load products right now.");
      } finally {
        setProductsLoading(false);
      }
    }

    loadProducts();
  }, []);

  // ================= SEARCH / AI =================

  async function handleSend(event) {
    event?.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage) return;

    if (productsLoading) {
      setErrorMessage("Products are still loading. Please wait.");
      return;
    }

    setChatLoading(true);
    setErrorMessage("");
    setAssistantReply("");
    setSubmittedMessage(trimmedMessage);

    const maxPrice = extractMaxPrice(trimmedMessage);
    const keyword = extractKeyword(trimmedMessage, products);

    const localResults = searchProducts(
      products,
      keyword,
      maxPrice
    );

    // Show local product search immediately.
    setResults(localResults);

    if (localResults.length > 0) {
      setAssistantReply(
        `I found ${localResults.length} product${
          localResults.length === 1 ? "" : "s"
        } matching your request.`
      );
    } else {
      setAssistantReply(
        "I couldn't find a matching product. Try another product name, brand, category, or budget."
      );
    }

    // Clear search box immediately.
    setMessage("");

    setTimeout(() => {
      scrollToSection("products");
    }, 50);

    // Gemini runs in the background.
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedMessage,
          products,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to contact the AI assistant."
        );
      }

      let reply = data.message || "";

      for (const toolCall of data.functionCalls || []) {
        if (
          toolCall.name === "add_to_cart" ||
          toolCall.name === "get_order_status" ||
          toolCall.name === "get_policy"
        ) {
          const toolResult = await handleAIToolCall({
            name: toolCall.name,
            args: toolCall.args,
          });

          if (toolResult?.message) {
            reply += reply
              ? `\n\n${toolResult.message}`
              : toolResult.message;
          }
        }
      }

      if (reply.trim()) {
        setAssistantReply(reply);
      }
    } catch (error) {
      console.error("CHAT ERROR:", error);

      const errorText = String(
        error?.message || ""
      ).toLowerCase();

      const quotaError =
        errorText.includes("429") ||
        errorText.includes("quota") ||
        errorText.includes("resource_exhausted");

      const lowerMessage = trimmedMessage.toLowerCase();

      const policyQuestion =
        lowerMessage.includes("return") ||
        lowerMessage.includes("refund") ||
        lowerMessage.includes("policy");

      if (policyQuestion) {
        setAssistantReply(RETURN_POLICY);
      } else if (localResults.length > 0) {
        setAssistantReply(
          `I found ${localResults.length} product${
            localResults.length === 1 ? "" : "s"
          } matching your request.`
        );
      } else if (quotaError) {
        setAssistantReply(
          "AI chat is temporarily unavailable, but you can continue browsing and shopping normally."
        );
      } else {
        setAssistantReply(
          "I couldn't process the AI request right now, but product search is still available."
        );
      }
    } finally {
      setChatLoading(false);
    }
  }

  // ================= QUICK ACTIONS =================

  function handleSuggestion(suggestion) {
    if (suggestion === "Track my Order") {
      openOrders();
      return;
    }

    if (suggestion === "Contact Human Support") {
      openHelp();
      return;
    }

    if (suggestion === "Return policy") {
      setSubmittedMessage("Return policy");
      setAssistantReply(RETURN_POLICY);
      setErrorMessage("");
      scrollToSection("assistant-response");
      return;
    }

    setMessage(suggestion);
    setErrorMessage("");
    scrollToSection("assistant-search");
  }

  // ================= ORDER TRACKING =================

  async function handleTrackOrder(event) {
    event?.preventDefault();

    const trimmedOrderId = orderId.trim();

    if (!trimmedOrderId) {
      setErrorMessage("Please enter your order ID.");
      return;
    }

    if (!/^\d+$/.test(trimmedOrderId)) {
      setErrorMessage("Order ID should contain numbers only.");
      return;
    }

    setOrderLoading(true);
    setErrorMessage("");
    setAssistantReply("");
    setTrackedOrder(null);

    try {
      const response = await fetch(
        `/api/orders/${Number(trimmedOrderId)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Order could not be found."
        );
      }

      setTrackedOrder(data.order);
      setShowOrderInput(false);
      setOrderId("");

      setTimeout(() => {
        scrollToSection("order-tracking");
      }, 50);
    } catch (error) {
      console.error("TRACK ORDER ERROR:", error);

      setErrorMessage(
        error.message || "Unable to track this order."
      );
    } finally {
      setOrderLoading(false);
    }
  }

  function resetOrderTracking() {
    setTrackedOrder(null);
    setShowOrderInput(true);
    setOrderId("");
    setErrorMessage("");
  }

  // ================= AI TOOL CALLS =================

  async function handleAIToolCall({ name, args }) {
    try {
      if (name === "add_to_cart") {
        const productId = Number(args?.productId);

        if (!Number.isFinite(productId)) {
          return {
            message: "I couldn't identify the product to add.",
          };
        }

        const product = products.find(
          (item) => Number(item.id) === productId
        );

        if (!product) {
          return {
            message:
              "I couldn't find that product in the store.",
          };
        }

        handleAddToCart(product);

        return {
          message: `${product.name} was added to your cart.`,
        };
      }

      if (name === "get_order_status") {
        const requestedOrderId = Number(args?.orderId);

        if (!Number.isFinite(requestedOrderId)) {
          return {
            message: "Please provide a valid order ID.",
          };
        }

        const response = await fetch(
          `/api/orders/${requestedOrderId}`
        );

        const data = await response.json();

        if (!response.ok) {
          return {
            message:
              data.error || "I couldn't find that order.",
          };
        }

        return {
          message: `Order #${data.order.id} is currently ${data.order.status}.`,
        };
      }

      if (name === "get_policy") {
        return {
          message: RETURN_POLICY,
        };
      }

      return {
        message: "I couldn't complete that request.",
      };
    } catch (error) {
      console.error("AI TOOL ERROR:", error);

      return {
        message:
          "I couldn't complete that request right now.",
      };
    }
  }

  // ================= CART =================

function openCart() {
  setMobileMenu(false);

  if (cart.length === 0) {
    setErrorMessage("Your cart is empty. Add a product first.");
    scrollToSection("products");
    return;
  }

  setErrorMessage("");
  setCheckout(false);

  scrollToSection("cart");
}

function handleAddToCart(product) {
  if (!product) return;

  setOrderPlaced(null);
  setErrorMessage("");

  setCart((currentCart) => {
    const existingProduct = currentCart.find(
      (item) => Number(item.id) === Number(product.id)
    );

    if (existingProduct) {
      return currentCart.map((item) =>
        Number(item.id) === Number(product.id)
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      );
    }

    return [
      ...currentCart,
      {
        ...product,
        quantity: 1,
      },
    ];
  });

  // Automatically move to Cart
  setTimeout(() => {
    scrollToSection("cart");
  }, 100);
}

function increaseQuantity(productId) {
  setCart((currentCart) =>
    currentCart.map((item) =>
      Number(item.id) === Number(productId)
        ? {
            ...item,
            quantity: item.quantity + 1,
          }
        : item
    )
  );
}

function decreaseQuantity(productId) {
  setCart((currentCart) =>
    currentCart
      .map((item) =>
        Number(item.id) === Number(productId)
          ? {
              ...item,
              quantity: item.quantity - 1,
            }
          : item
      )
      .filter((item) => item.quantity > 0)
  );
}

function removeFromCart(productId) {
  setCart((currentCart) =>
    currentCart.filter(
      (item) => Number(item.id) !== Number(productId)
    )
  );
}

function openCheckout() {
    if (cart.length === 0) {
    setErrorMessage("Your cart is empty. Add a product first.");
      return;
  }

  setErrorMessage("");
  setCheckout(true);

  setTimeout(() => {
    scrollToSection("checkout");
  }, 100);
}

  function increaseQuantity(productId) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        Number(item.id) === Number(productId)
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      )
    );
  }

  function decreaseQuantity(productId) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          Number(item.id) === Number(productId)
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId) {
    setCart((currentCart) =>
      currentCart.filter(
        (item) => Number(item.id) !== Number(productId)
      )
    );
  }

  const cartItemCount = cart.reduce(
    (total, product) => total + product.quantity,
    0
  );

  const cartTotal = cart.reduce(
    (total, product) =>
      total + Number(product.price) * product.quantity,
    0
  );

  // ================= CHECKOUT =================

  function openCheckout() {
    if (cart.length === 0) {
      setErrorMessage(
        "Your cart is empty. Add a product first."
      );
      scrollToSection("products");
      return;
    }

    setErrorMessage("");
    setCheckout(true);

    setTimeout(() => {
      scrollToSection("checkout");
    }, 50);
  }

  async function handlePlaceOrder(event) {
    event?.preventDefault();

    if (cart.length === 0) {
      setErrorMessage("Your cart is empty.");
      return;
    }

    try {
      setErrorMessage("");

      const response = await fetch(
        "/api/orders/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName,
            customerEmail,
            customerAddress,
            totalAmount: cartTotal,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not place the order."
        );
      }

      setOrderPlaced(data.order);
      setCart([]);
      setCheckout(false);

      setCustomerName("");
      setCustomerEmail("");
      setCustomerAddress("");

      setTrackedOrder(null);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      console.error("PLACE ORDER ERROR:", error);

      setErrorMessage(
        error.message ||
          "Unable to place the order right now."
      );
    }
  }

  // ================= HUMAN SUPPORT =================

  async function handleHumanSupport(event) {
    event.preventDefault();

    if (!customerName.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }

    if (!customerEmail.trim()) {
      setErrorMessage("Please enter your email.");
      return;
    }

    if (!handoffMessage.trim()) {
      setErrorMessage(
        "Please describe your issue first."
      );
      return;
    }

    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/complaints",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName: customerName.trim(),
            customerEmail: customerEmail.trim(),
            message: handoffMessage.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not submit complaint."
        );
      }

      setComplaint({
        id: data.complaint.id,
        status: data.complaint.status,
        message: data.complaint.message,
      });

      setCustomerName("");
      setCustomerEmail("");
      setHandoffMessage("");
      setShowHumanHandoff(false);

      setTimeout(() => {
        scrollToSection("support");
      }, 50);
    } catch (error) {
      console.error(
        "COMPLAINT SUBMISSION ERROR:",
        error
      );

      setErrorMessage(
        error.message ||
          "Could not submit your complaint."
      );
    }
  }

  // ================= UI =================

  return (
    <main className="min-h-screen w-full bg-[#F8FAFC] text-[#023047]">

      {/* ================= HEADER ================= */}

      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur">

        <div className="flex min-h-[76px] w-full items-center justify-between px-4 sm:px-6 lg:px-10">

          <button
            type="button"
            onClick={goHome}
            className="flex items-center gap-3"
          >
            <img
              src="/shop-pilot-assests/favicon.ico"
              alt="ShopPilot"
              className="h-11 w-11 rounded-xl object-contain"
            />

            <div className="text-left">
              <h1 className="text-xl font-extrabold tracking-tight text-[#023047]">
                Shop
                <span className="text-[#219EBC]">
                  Pilot
                </span>
              </h1>

              <p className="hidden text-xs text-slate-500 sm:block">
                Your AI Shopping Co-pilot
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">

            <button
              type="button"
              onClick={() =>
                scrollToSection("products")
              }
              className="transition hover:text-[#219EBC]"
            >
              Products
            </button>

            <button
              type="button"
              onClick={openOrders}
              className="transition hover:text-[#219EBC]"
            >
              Orders
            </button>

            <button
              type="button"
              onClick={openHelp}
              className="transition hover:text-[#219EBC]"
            >
              Help
            </button>

          </nav>

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={openCart}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white transition hover:border-[#219EBC] hover:bg-[#8ECAE6]/20"
              aria-label="Shopping cart"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-[#023047]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6" />
                <circle cx="10" cy="20" r="1" />
                <circle cx="18" cy="20" r="1" />
              </svg>

              {cartItemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFB703] px-1 text-[10px] font-extrabold text-[#023047]">
                  {cartItemCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setMobileMenu((value) => !value)
              }
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 md:hidden"
              aria-label="Menu"
            >
              <span className="text-xl">
                {mobileMenu ? "×" : "☰"}
              </span>
            </button>

          </div>
        </div>

        {mobileMenu && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <div className="grid gap-2">

              <button
                type="button"
                onClick={() =>
                  scrollToSection("products")
                }
                className="rounded-xl px-4 py-3 text-left text-sm font-semibold hover:bg-[#8ECAE6]/15"
              >
                Products
              </button>

              <button
                type="button"
                onClick={openOrders}
                className="rounded-xl px-4 py-3 text-left text-sm font-semibold hover:bg-[#8ECAE6]/15"
              >
                Orders
              </button>

              <button
                type="button"
                onClick={openHelp}
                className="rounded-xl px-4 py-3 text-left text-sm font-semibold hover:bg-[#8ECAE6]/15"
              >
                Help & Support
              </button>

              <button
                type="button"
                onClick={openCart}
                className="rounded-xl bg-[#023047] px-4 py-3 text-left text-sm font-semibold text-white"
              >
                Cart{" "}
                {cartItemCount > 0
                  ? `(${cartItemCount})`
                  : ""}
              </button>

            </div>
          </div>
        )}

        <div className="h-1 w-full bg-gradient-to-r from-[#8ECAE6] via-[#219EBC] to-[#FFB703]" />

      </header>

      {/* ================= HERO ================= */}

      <section className="relative overflow-hidden bg-white">

        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-[#8ECAE6]/20 blur-3xl" />
        <div className="absolute -right-32 top-20 h-72 w-72 rounded-full bg-[#FFB703]/15 blur-3xl" />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-10 lg:py-20">

          <div className="mx-auto max-w-4xl text-center">

            <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-[#8ECAE6] bg-[#8ECAE6]/15 px-4 py-2 text-xs font-bold text-[#023047]">
              <span className="h-2 w-2 rounded-full bg-[#219EBC]" />
              AI-powered shopping assistant
            </div>

            <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-[#023047] sm:text-5xl lg:text-6xl">
              Your Personal
              <span className="block text-[#219EBC]">
                Shopping Co-Pilot
              </span>
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg">
              Find products, compare options, manage your
              cart, track orders, and get support — all in
              one place.
            </p>

            <form
              id="assistant-search"
              onSubmit={handleSend}
              className="mx-auto mt-9 flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/60 sm:flex-row"
            >

              <div className="relative flex-1">

                <svg
                  viewBox="0 0 24 24"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#219EBC]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20L16 16" />
                </svg>

                <input
                  type="text"
                  value={message}
                  onChange={(event) =>
                    setMessage(event.target.value)
                  }
                  disabled={productsLoading}
                  placeholder={
                    productsLoading
                      ? "Loading products..."
                      : "Search products, brands, categories..."
                  }
                  className="h-14 w-full rounded-xl bg-slate-50 pl-12 pr-4 text-sm text-[#023047] outline-none placeholder:text-slate-400 focus:bg-white"
                />

              </div>

              <button
                type="submit"
                disabled={
                  productsLoading ||
                  !message.trim()
                }
                className="h-14 rounded-xl bg-[#219EBC] px-8 text-sm font-bold text-white transition hover:bg-[#023047] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Search
              </button>

            </form>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">

              <span className="mr-1 text-xs font-semibold text-slate-400">
                Popular:
              </span>

              {[
                "Shoes",
                "Nike shoes",
                "iphone 15",
                "Shoes under ₹5,000",
              ].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    handleSuggestion(item)
                  }
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#023047] transition hover:border-[#219EBC] hover:bg-[#8ECAE6]/15"
                >
                  {item}
                </button>
              ))}

            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl gap-4 md:grid-cols-3">

            <button
              type="button"
              onClick={() =>
                scrollToSection("products")
              }
              className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#8ECAE6] hover:shadow-lg"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8ECAE6]/30 text-[#219EBC]">
                🔎
              </div>

              <h3 className="mt-4 text-lg font-bold">
                Find Products
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Search naturally by product, brand,
                category, or budget.
              </p>
            </button>

            <button
              type="button"
              onClick={openCart}
              className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#FFB703] hover:shadow-lg"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFB703]/25 text-[#FB8500]">
                🛒
              </div>

              <h3 className="mt-4 text-lg font-bold">
                Smart Cart
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Add products, change quantities, and
                checkout easily.
              </p>
            </button>

            <button
              type="button"
              onClick={openOrders}
              className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#8ECAE6] hover:shadow-lg"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8ECAE6]/30 text-[#023047]">
                📦
              </div>

              <h3 className="mt-4 text-lg font-bold">
                Track Orders
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter your order ID and quickly check
                its current status.
              </p>
            </button>

          </div>
        </div>
      </section>

      {/* ================= AI RESPONSE ================= */}

      {(submittedMessage ||
        assistantReply ||
        errorMessage) && (
        <section
          id="assistant-response"
          className="w-full bg-[#F8FAFC] px-4 py-8 sm:px-6 lg:px-10"
        >
          <div className="mx-auto max-w-7xl">

            {submittedMessage && (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[#219EBC]">
                  Your search
                </p>

                <p className="mt-1 font-semibold text-[#023047]">
                  {submittedMessage}
                </p>
              </div>
            )}

            {assistantReply && (
              <div className="rounded-2xl border border-[#8ECAE6] bg-white p-6 shadow-sm">

                <div className="flex items-center gap-3">

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#023047] font-bold text-[#FFB703]">
                    SP
                  </div>

                  <div>
                    <h3 className="font-bold text-[#023047]">
                      ShopPilot
                    </h3>

                    <p className="text-xs text-[#219EBC]">
                      Shopping Assistant
                    </p>
                  </div>

                </div>

                <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">
                  {assistantReply}
                </p>

              </div>
            )}

            {errorMessage && (
              <div className="mt-4 rounded-2xl border border-[#FB8500] bg-[#FFB703]/10 p-5">

                <p className="font-bold text-[#023047]">
                  Something needs attention
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  {errorMessage}
                </p>

              </div>
            )}

          </div>
        </section>
      )}

      {/* ================= PRODUCTS ================= */}

      <section
        id="products"
        className="w-full scroll-mt-24 bg-white px-4 py-12 sm:px-6 lg:px-10"
      >
        <div className="mx-auto max-w-7xl">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#219EBC]">
                Store
              </p>

              <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-[#023047]">
                {results.length > 0
                  ? "Recommended Products"
                  : "Popular Products"}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Explore products available in the
                ShopPilot store.
              </p>
            </div>

            {results.length > 0 && (
              <button
                type="button"
                onClick={() => setResults([])}
                className="text-sm font-bold text-[#219EBC] hover:text-[#023047]"
              >
                Show all products
              </button>
            )}

          </div>

          {productsLoading ? (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
              <p className="font-semibold text-[#023047]">
                Loading products...
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

              {(results.length > 0
                ? results
                : products
              ).map((product) => (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:border-[#8ECAE6] hover:shadow-xl"
                >

                  <div className="relative flex h-56 items-center justify-center bg-[#F8FAFC] p-5">

                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
                    />

                    {product.brand && (
                      <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#219EBC] shadow-sm">
                        {product.brand}
                      </span>
                    )}

                  </div>

                  <div className="p-5">

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {product.category || "Product"}
                    </p>

                    <h3 className="mt-2 min-h-[48px] text-base font-bold text-[#023047]">
                      {product.name}
                    </h3>

                    <div className="mt-3 flex items-center justify-between">

                      <p className="text-xl font-extrabold text-[#FB8500]">
                        ₹
                        {Number(
                          product.price
                        ).toLocaleString("en-IN")}
                      </p>

                      <span className="text-xs font-semibold text-green-600">
                        In stock
                      </span>

                    </div>

                    <div className="mt-5 grid gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          handleAddToCart(product)
                        }
                        className="rounded-xl bg-[#FFB703] px-4 py-3 text-sm font-bold text-[#023047] transition hover:bg-[#FB8500] hover:text-white"
                      >
                        Add to Cart
                      </button>

                      {product.product_url &&
                      product.product_url !== "#" ? (
                        <a
                          href={product.product_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-[#023047] transition hover:border-[#219EBC] hover:bg-[#8ECAE6]/10"
                        >
                          View Product
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleAddToCart(product)
                          }
                          className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-[#023047] transition hover:border-[#219EBC] hover:bg-[#8ECAE6]/10"
                        >
                          Select Product
                        </button>
                      )}

                    </div>
                  </div>

                </article>
              ))}

            </div>
          )}

        </div>
      </section>

      {/* ================= ORDER TRACKING ================= */}

      <section
        id="order-tracking"
        className="w-full scroll-mt-24 bg-[#F8FAFC] px-4 py-12 sm:px-6 lg:px-10"
      >
        <div className="mx-auto max-w-7xl">

          <div className="rounded-3xl border border-[#8ECAE6] bg-white p-7 shadow-sm sm:p-10">

            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

              <div>

                <p className="text-xs font-bold uppercase tracking-widest text-[#219EBC]">
                  Orders
                </p>

                <h2 className="mt-2 text-3xl font-extrabold text-[#023047]">
                  Track your order
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  Enter your order ID to check the
                  latest status of your order.
                </p>

              </div>

              {!showOrderInput &&
                !trackedOrder && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowOrderInput(true);
                      setTrackedOrder(null);
                      setErrorMessage("");
                    }}
                    className="rounded-xl bg-[#219EBC] px-6 py-3 font-bold text-white transition hover:bg-[#023047]"
                  >
                    Track My Order
                  </button>
                )}

            </div>

            {showOrderInput && (
              <form
                onSubmit={handleTrackOrder}
                className="mt-7 flex flex-col gap-3 sm:flex-row"
              >

                <input
                  type="text"
                  inputMode="numeric"
                  value={orderId}
                  onChange={(event) =>
                    setOrderId(event.target.value)
                  }
                  placeholder="Enter Order ID"
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[#023047] outline-none focus:border-[#219EBC] focus:ring-2 focus:ring-[#8ECAE6]/30"
                />

                <button
                  type="submit"
                  disabled={orderLoading}
                  className="rounded-xl bg-[#FB8500] px-6 py-3 font-bold text-white transition hover:bg-[#023047] disabled:opacity-50"
                >
                  {orderLoading
                    ? "Checking..."
                    : "Check Order"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowOrderInput(false);
                    setOrderId("");
                    setErrorMessage("");
                  }}
                  className="rounded-xl border border-slate-300 px-6 py-3 font-semibold text-[#023047] hover:bg-slate-50"
                >
                  Cancel
                </button>

              </form>
            )}

            {trackedOrder && (
              <div className="mt-7 overflow-hidden rounded-2xl border border-green-200 bg-green-50">

                <div className="border-b border-green-200 bg-white p-6">

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-4">

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                        ✓
                      </div>

                      <div>

                        <p className="text-xs font-bold uppercase tracking-widest text-green-700">
                          Order Status
                        </p>

                        <h3 className="mt-1 text-xl font-extrabold text-[#023047]">
                          Order #{trackedOrder.id}
                        </h3>

                      </div>
                    </div>

                    <span className="w-fit rounded-full bg-green-100 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-green-700">
                      {trackedOrder.status}
                    </span>

                  </div>
                </div>

                <div className="p-6">

                  <p className="text-sm leading-6 text-slate-600">
                    Your order has been successfully
                    confirmed. You can use this order ID
                    to check the status again later.
                  </p>

                  <div className="mt-5 grid gap-4 sm:grid-cols-3">

                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Order ID
                      </p>

                      <p className="mt-1 font-bold text-[#023047]">
                        #{trackedOrder.id}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Status
                      </p>

                      <p className="mt-1 font-bold capitalize text-green-600">
                        {trackedOrder.status}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Total
                      </p>

                      <p className="mt-1 font-bold text-[#FB8500]">
                        ₹
                        {Number(
                          trackedOrder.total_amount || 0
                        ).toLocaleString("en-IN")}
                      </p>
                    </div>

                  </div>

                  <button
                    type="button"
                    onClick={resetOrderTracking}
                    className="mt-5 rounded-xl bg-[#023047] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#219EBC]"
                  >
                    Track Another Order
                  </button>

                </div>
              </div>
            )}

            {errorMessage &&
              !trackedOrder &&
              !checkout && (
                <div className="mt-5 rounded-xl border border-[#FB8500] bg-[#FFB703]/10 p-4">
                  <p className="text-sm font-semibold text-[#023047]">
                    {errorMessage}
                  </p>
                </div>
              )}

          </div>
        </div>
      </section>

      {/* ================= CART ================= */}

      {cart.length > 0 && (
  <section
    id="cart"
    className="w-full scroll-mt-24 bg-white px-4 py-12 sm:px-6 lg:px-10"
  >
    <div className="mx-auto max-w-7xl">

      {/* Cart Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#219EBC]">
            Shopping
          </p>

          <h2 className="mt-1 text-3xl font-extrabold text-[#023047]">
            Your Cart
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {cartItemCount} {cartItemCount === 1 ? "item" : "items"} in your cart
          </p>
        </div>

        <p className="text-2xl font-extrabold text-[#FB8500]">
          ₹{cartTotal.toLocaleString("en-IN")}
        </p>
      </div>

      {/* Cart Items */}
      <div className="mt-7 grid gap-4">

        {cart.map((product) => (
          <div
            key={product.id}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#8ECAE6] hover:shadow-md sm:flex-row sm:items-center"
          >

            {/* Product Image */}
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[#F8FAFC] p-2">
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-contain"
              />
            </div>

            {/* Product Details */}
            <div className="flex-1">

              <h3 className="font-bold text-[#023047]">
                {product.name}
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {product.brand}
              </p>

              <p className="mt-2 font-bold text-[#FB8500]">
                ₹{Number(product.price).toLocaleString("en-IN")}
              </p>

            </div>

            {/* Quantity Controls */}
            <div className="flex items-center gap-2">

              <button
                type="button"
                onClick={() => decreaseQuantity(product.id)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 font-bold text-[#023047] transition hover:border-[#219EBC] hover:bg-[#8ECAE6]/10"
              >
                −
              </button>

              <span className="w-8 text-center font-bold text-[#023047]">
                {product.quantity}
              </span>

              <button
                type="button"
                onClick={() => increaseQuantity(product.id)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 font-bold text-[#023047] transition hover:border-[#219EBC] hover:bg-[#8ECAE6]/10"
              >
                +
              </button>

            </div>

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeFromCart(product.id)}
              className="text-sm font-semibold text-red-500 transition hover:text-red-700"
            >
              Remove
            </button>

          </div>
        ))}

      </div>

      {/* Cart Summary */}
      <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <p className="text-sm text-slate-500">
            Total Items
          </p>

          <p className="font-bold text-[#023047]">
            {cartItemCount}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">
            Cart Total
          </p>

          <p className="text-xl font-extrabold text-[#FB8500]">
            ₹{cartTotal.toLocaleString("en-IN")}
          </p>
        </div>

        <button
          type="button"
          onClick={openCheckout}
          className="rounded-xl bg-[#023047] px-8 py-3 font-bold text-white transition hover:bg-[#219EBC]"
        >
          Proceed to Checkout
        </button>

      </div>

    </div>
  </section>

      )}

      {/* ================= CHECKOUT ================= */}

      {checkout && (
        <section
          id="checkout"
          className="w-full scroll-mt-24 bg-[#F8FAFC] px-4 py-12 sm:px-6 lg:px-10"
        >
          <div className="mx-auto max-w-3xl">

            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">

              <p className="text-xs font-bold uppercase tracking-widest text-[#219EBC]">
                Checkout
              </p>

              <h2 className="mt-2 text-3xl font-extrabold text-[#023047]">
                Complete your order
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Enter your details to place your order.
              </p>

              <form
                onSubmit={handlePlaceOrder}
                className="mt-7 space-y-4"
              >

                <input
                  type="text"
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(event.target.value)
                  }
                  placeholder="Full Name"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#219EBC]"
                />

                <input
                  type="email"
                  value={customerEmail}
                  onChange={(event) =>
                    setCustomerEmail(event.target.value)
                  }
                  placeholder="Email Address"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#219EBC]"
                />

                <textarea
                  value={customerAddress}
                  onChange={(event) =>
                    setCustomerAddress(
                      event.target.value
                    )
                  }
                  placeholder="Delivery Address"
                  rows={4}
                  required
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#219EBC]"
                />

                <div className="rounded-xl bg-[#F8FAFC] p-4">

                  <div className="flex items-center justify-between">

                    <span className="font-semibold text-slate-600">
                      Order Total
                    </span>

                    <span className="text-xl font-extrabold text-[#FB8500]">
                      ₹{cartTotal.toLocaleString("en-IN")}
                    </span>

                  </div>

                </div>

                <div className="flex flex-col gap-3 sm:flex-row">

                  <button
                    type="submit"
                    className="flex-1 rounded-xl bg-[#219EBC] px-6 py-3 font-bold text-white transition hover:bg-[#023047]"
                  >
                    Place Order
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCheckout(false);
                      scrollToSection("cart");
                    }}
                    className="rounded-xl border border-slate-300 px-6 py-3 font-semibold text-[#023047] hover:bg-slate-50"
                  >
                    Back to Cart
                  </button>

                </div>

              </form>

            </div>
          </div>
        </section>
      )}

      {/* ================= ORDER CONFIRMATION ================= */}

      {orderPlaced && (
        <section className="w-full bg-white px-4 py-12 sm:px-6 lg:px-10">

          <div className="mx-auto max-w-3xl">

            <div className="rounded-3xl border border-green-200 bg-green-50 p-8 text-center">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-2xl text-white">
                ✓
              </div>

              <p className="mt-5 text-xs font-bold uppercase tracking-widest text-green-700">
                Order confirmed
              </p>

              <h2 className="mt-2 text-3xl font-extrabold text-[#023047]">
                Thank you for your order!
              </h2>

              <p className="mt-3 text-slate-600">
                Your order has been successfully
                created.
              </p>

              <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-white p-5 shadow-sm">

                <p className="text-sm text-slate-500">
                  Order ID
                </p>

                <p className="mt-1 text-3xl font-extrabold text-[#219EBC]">
                  #{orderPlaced.id}
                </p>

                <p className="mt-3 text-sm text-slate-500">
                  Status
                </p>

                <p className="font-bold capitalize text-green-600">
                  {orderPlaced.status}
                </p>

              </div>

              <button
                type="button"
                onClick={() => {
                  setOrderId(
                    String(orderPlaced.id)
                  );

                  setTrackedOrder(null);
                  setShowOrderInput(true);

                  scrollToSection(
                    "order-tracking"
                  );
                }}
                className="mt-6 rounded-xl bg-[#023047] px-6 py-3 font-bold text-white hover:bg-[#219EBC]"
              >
                Track This Order
              </button>

            </div>
          </div>
        </section>
      )}

      {/* ================= SUPPORT ================= */}

      <section
        id="support"
        className="w-full scroll-mt-24 bg-[#F8FAFC] px-4 py-12 sm:px-6 lg:px-10"
      >
        <div className="mx-auto max-w-7xl">

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">

            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

              <div>

                <p className="text-xs font-bold uppercase tracking-widest text-[#FB8500]">
                  Need help?
                </p>

                <h2 className="mt-2 text-3xl font-extrabold text-[#023047]">
                  Talk to Human Support
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  If ShopPilot cannot solve your problem,
                  send a support request to our team.
                </p>

              </div>

              {!showHumanHandoff && !complaint && (
                <button
                  type="button"
                  onClick={() =>
                    setShowHumanHandoff(true)
                  }
                  className="rounded-xl bg-[#FB8500] px-6 py-3 font-bold text-white transition hover:bg-[#023047]"
                >
                  Contact Support
                </button>
              )}

            </div>

            {/* SUPPORT FORM */}

            {showHumanHandoff && !complaint && (
              <form
                onSubmit={handleHumanSupport}
                className="mt-7"
              >

                <input
                  type="text"
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(
                      event.target.value
                    )
                  }
                  placeholder="Enter your name"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-[#023047] outline-none focus:border-[#219EBC]"
                />

                <input
                  type="email"
                  value={customerEmail}
                  onChange={(event) =>
                    setCustomerEmail(
                      event.target.value
                    )
                  }
                  placeholder="Enter your email"
                  required
                  className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-[#023047] outline-none focus:border-[#219EBC]"
                />

                <textarea
                  value={handoffMessage}
                  onChange={(event) =>
                    setHandoffMessage(
                      event.target.value
                    )
                  }
                  placeholder="Describe your issue..."
                  rows={4}
                  required
                  className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-[#023047] outline-none focus:border-[#219EBC]"
                />

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[#FB8500] px-6 py-3 font-bold text-white transition hover:bg-[#023047] sm:w-auto"
                  >
                    Submit Complaint
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHumanHandoff(false);
                      setHandoffMessage("");
                      setErrorMessage("");
                    }}
                    className="w-full rounded-xl border border-slate-300 px-6 py-3 font-semibold text-[#023047] transition hover:bg-slate-50 sm:w-auto"
                  >
                    Cancel
                  </button>

                </div>

              </form>
            )}

            {/* COMPLAINT SUCCESS CARD */}

            {complaint && (
              <div className="mt-7 overflow-hidden rounded-2xl border border-[#8ECAE6] bg-[#F8FAFC]">

                <div className="border-b border-[#8ECAE6] bg-white p-6">

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-4">

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#219EBC] text-xl font-bold text-white">
                        ✓
                      </div>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#219EBC]">
                          Complaint Submitted
                        </p>

                        <h3 className="mt-1 text-xl font-extrabold text-[#023047]">
                          Complaint #{complaint.id}
                        </h3>
                      </div>

                    </div>

                    <span className="w-fit rounded-full bg-[#FFB703]/20 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-[#FB8500]">
                      Assigned to Human
                    </span>

                  </div>
                </div>

                <div className="p-6">

                  <p className="text-sm leading-6 text-slate-600">
                    Your complaint has been successfully
                    submitted. You can use this complaint
                    ID to check the status later.
                  </p>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">

                    <div className="rounded-xl bg-white p-4">

                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Complaint ID
                      </p>

                      <p className="mt-1 text-xl font-extrabold text-[#219EBC]">
                        #{complaint.id}
                      </p>

                    </div>

                    <div className="rounded-xl bg-white p-4">

                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Status
                      </p>

                      <p className="mt-1 font-bold capitalize text-[#FB8500]">
                        {complaint.status}
                      </p>

                    </div>

                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setComplaint(null);
                      setShowHumanHandoff(true);
                      setCustomerName("");
                      setCustomerEmail("");
                      setHandoffMessage("");
                      setErrorMessage("");
                    }}
                    className="mt-5 rounded-xl bg-[#023047] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#219EBC]"
                  >
                    Submit Another Complaint
                  </button>

                </div>
              </div>
            )}

            {/* SUPPORT ERROR */}

            {errorMessage &&
              showHumanHandoff &&
              !complaint && (
                <div className="mt-5 rounded-xl border border-[#FB8500] bg-[#FFB703]/10 p-4">

                  <p className="text-sm font-semibold text-[#023047]">
                    {errorMessage}
                  </p>

                </div>
              )}

          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}

      <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-10">

        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">

          <button
            type="button"
            onClick={goHome}
            className="flex items-center justify-center gap-2 sm:justify-start"
          >

            <img
              src="/shop-pilot-assests/favicon.ico"
              alt="ShopPilot"
              className="h-7 w-7 rounded-lg object-contain"
            />

            <span className="font-bold text-[#023047]">
              Shop
              <span className="text-[#219EBC]">
                Pilot
              </span>
            </span>

          </button>

          <p className="text-xs text-slate-400">
            AI Shopping Co-pilot • Built by Abhishek
          </p>

        </div>

      </footer>

    </main>
  );
}