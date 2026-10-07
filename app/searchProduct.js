export function searchProducts(
  products = [],
  keyword = "",
  maxPrice = Infinity
) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const maxPriceLimit = Number.isFinite(maxPrice)
    ? maxPrice
    : Infinity;

  return products.filter((product) => {
    const name = (product.name || "").toLowerCase();
    const brand = (product.brand || "").toLowerCase();
    const category = (product.category || "").toLowerCase();

    const matchesKeyword =
      !normalizedKeyword ||
      name.includes(normalizedKeyword) ||
      brand.includes(normalizedKeyword) ||
      category.includes(normalizedKeyword);

    const matchesPrice = Number(product.price) <= maxPriceLimit;

    return matchesKeyword && matchesPrice;
  });
}

export function extractMaxPrice(message) {
  const text = message.toLowerCase();

  const hasPriceWord =
    text.includes("under") ||
    text.includes("below") ||
    text.includes("less than") ||
    text.includes("within") ||
    text.includes("budget");

  if (!hasPriceWord) {
    return Infinity;
  }

  const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*lakh/);
  if (lakhMatch) {
    return Number(lakhMatch[1]) * 100000;
  }

  const thousandMatch = text.match(/(\d+(?:\.\d+)?)\s*thousand/);
  if (thousandMatch) {
    return Number(thousandMatch[1]) * 1000;
  }

  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (kMatch) {
    return Number(kMatch[1]) * 1000;
  }

  const rupeeMatch = text.match(/₹\s*([\d,]+)/);
  if (rupeeMatch) {
    return Number(rupeeMatch[1].replace(/,/g, ""));
  }

  const numberMatch = text.match(/\b(\d[\d,]*)\b/);
  if (!numberMatch) {
    return Infinity;
  }

  return Number(numberMatch[1].replace(/,/g, ""));
}

export function extractKeyword(message, products = []) {
  const text = message.toLowerCase();

  const nameMatch = products.find((product) =>
    text.includes((product.name || "").toLowerCase())
  );

  if (nameMatch) {
    return nameMatch.name;
  }

  const brandMatch = products.find((product) =>
    text.includes((product.brand || "").toLowerCase())
  );

  if (brandMatch) {
    return brandMatch.brand;
  }

  if (
    text.includes("phone") ||
    text.includes("phones") ||
    text.includes("iphone") ||
    text.includes("mobile") ||
    text.includes("mobiles")
  ) {
    return "mobile";
  }

  const categoryMatch = products.find((product) =>
    text.includes((product.category || "").toLowerCase())
  );

  if (categoryMatch) {
    return categoryMatch.category;
  }

  return "";
}