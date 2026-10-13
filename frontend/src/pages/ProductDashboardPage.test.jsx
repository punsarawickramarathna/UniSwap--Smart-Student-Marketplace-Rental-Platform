import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../context/AuthContext";
import ProductDashboardPage from "./ProductDashboardPage";
import { getCategories, getProducts } from "../services/products";
import { getMyReviews } from "../services/reviews";

vi.mock("../services/products", () => ({
  getCategories: vi.fn(),
  getProducts: vi.fn(),
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  uploadProductImage: vi.fn(),
}));

vi.mock("../services/reviews", () => ({
  getMyReviews: vi.fn(),
  getProductReviews: vi.fn(),
  createReview: vi.fn(),
  updateReview: vi.fn(),
  deleteReview: vi.fn(),
}));

vi.mock("../services/sellers", () => ({
  getSellerReputation: vi.fn().mockResolvedValue({
    score: 95,
    average_rating: 4.8,
    total_reviews: 10,
    total_products: 5,
  }),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "student@campus.edu", student_id: "ITBIN12345678" },
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }) => <div>{children}</div>,
}));

describe("ProductDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getCategories.mockResolvedValue([
      { id: "c1", name: "Academic Books", count: 5 },
      { id: "c2", name: "Calculators", count: 2 },
    ]);

    getProducts.mockResolvedValue({
      items: [
        {
          id: "p1",
          title: "Database Management Systems",
          category: "Academic Books",
          condition: "Used - Good",
          product_type: "For Sale",
          price: 2500,
          rating: 4.8,
          reviews_count: 12,
          seller_name: "Kasun Perera",
          seller_score: 94,
          status: "available",
          images: [],
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    getMyReviews.mockResolvedValue({
      items: [
        {
          id: "r1",
          product_title: "Database Management Systems",
          rating: 5,
          comment: "Great condition book!",
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      average_rating: 5.0,
    });
  });

  it("renders Marketplace view with products from API", async () => {
    render(<ProductDashboardPage initialView="Marketplace" />);

    expect(screen.getByText(/Buy, sell, rent & exchange with fellow students/i)).toBeTruthy();
    expect(await screen.findByText("Database Management Systems")).toBeTruthy();
    expect(screen.getByText("Rs. 2,500")).toBeTruthy();
  });

  it("switches to Categories view and displays categories", async () => {
    render(<ProductDashboardPage initialView="Categories" />);

    expect(await screen.findByText("Academic Books")).toBeTruthy();
    expect(screen.getByText("Calculators")).toBeTruthy();
  });

  it("switches to My Products view", async () => {
    render(<ProductDashboardPage initialView="My Products" />);

    expect(await screen.findByText("Your listings")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add Product/i })).toBeTruthy();
  });

  it("switches to My Reviews view", async () => {
    render(<ProductDashboardPage initialView="My Reviews" />);

    expect(await screen.findByText("Reviews you have shared.")).toBeTruthy();
    expect(await screen.findByText("Great condition book!")).toBeTruthy();
  });
});
