import { beforeEach, describe, expect, it, vi } from "vitest";

import api from "./api";
import {
  createProduct,
  deleteProduct,
  getCategories,
  getProduct,
  getProducts,
  updateProduct,
  uploadProductImage,
} from "./products";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("products API service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches products with query params", async () => {
    const mockData = { items: [{ id: "1", title: "Book" }], total: 1 };
    api.get.mockResolvedValue({ data: mockData });

    const result = await getProducts({ q: "Book", category: "Academic Books" });
    expect(api.get).toHaveBeenCalledWith("/products", {
      params: { q: "Book", category: "Academic Books" },
    });
    expect(result).toEqual(mockData);
  });

  it("fetches single product by ID", async () => {
    const mockProd = { id: "p1", title: "Calculator" };
    api.get.mockResolvedValue({ data: mockProd });

    const result = await getProduct("p1");
    expect(api.get).toHaveBeenCalledWith("/products/p1");
    expect(result).toEqual(mockProd);
  });

  it("creates a new product", async () => {
    const payload = { title: "Laptop", price: 50000 };
    api.post.mockResolvedValue({ data: { id: "p2", ...payload } });

    const result = await createProduct(payload);
    expect(api.post).toHaveBeenCalledWith("/products", payload);
    expect(result.id).toBe("p2");
  });

  it("updates an existing product", async () => {
    const payload = { title: "Updated Laptop", price: 45000 };
    api.put.mockResolvedValue({ data: { id: "p2", ...payload } });

    const result = await updateProduct("p2", payload);
    expect(api.put).toHaveBeenCalledWith("/products/p2", payload);
    expect(result.title).toBe("Updated Laptop");
  });

  it("deletes a product", async () => {
    api.delete.mockResolvedValue({ data: null });

    await deleteProduct("p2");
    expect(api.delete).toHaveBeenCalledWith("/products/p2");
  });

  it("uploads product image via FormData", async () => {
    const fakeFile = new File(["dummy content"], "photo.png", { type: "image/png" });
    api.post.mockResolvedValue({ data: { url: "https://storage.supabase.com/photo.png" } });

    const url = await uploadProductImage(fakeFile);
    expect(api.post).toHaveBeenCalledWith(
      "/products/images/upload",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    expect(url).toBe("https://storage.supabase.com/photo.png");
  });

  it("fetches categories", async () => {
    const mockCategories = [{ id: "c1", name: "Academic Books", count: 12 }];
    api.get.mockResolvedValue({ data: mockCategories });

    const result = await getCategories();
    expect(api.get).toHaveBeenCalledWith("/categories");
    expect(result).toEqual(mockCategories);
  });
});
