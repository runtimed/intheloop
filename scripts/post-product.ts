/**
 * Script to post an example product to the API
 * Usage: pnpm run post-product
 */

const API_URL = process.env.API_URL || "http://localhost:8787";

const exampleProduct = {
  name: "Example Product",
  description: "This is an example product created by the post-product script",
  price: 29.99,
};

async function postProduct() {
  try {
    const response = await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(exampleProduct),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorText}`
      );
    }

    console.log("response", response);

    const result = await response.json();
    console.log("✅ Product created successfully:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Error posting product:", error);
    process.exit(1);
  }
}

postProduct();
