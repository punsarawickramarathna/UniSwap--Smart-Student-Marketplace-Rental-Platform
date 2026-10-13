import { beforeEach, describe, expect, it, vi } from "vitest";

import api from "./api";
import {
  createReview,
  deleteReview,
  getMyReviews,
  getProductReviews,
  updateReview,
} from "./reviews";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("reviews API service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches reviews for a product", async () => {
    const mockData = { items: [{ id: "r1", rating: 5, comment: "Great" }], total: 1, average_rating: 5.0 };
    api.get.mockResolvedValue({ data: mockData });

    const result = await getProductReviews("prod123");
    expect(api.get).toHaveBeenCalledWith("/products/prod123/reviews");
    expect(result).toEqual(mockData);
  });

  it("fetches user's own reviews", async () => {
    const mockData = { items: [{ id: "r1", rating: 4, comment: "Nice" }], total: 1 };
    api.get.mockResolvedValue({ data: mockData });

    const result = await getMyReviews();
    expect(api.get).toHaveBeenCalledWith("/reviews/my");
    expect(result).toEqual(mockData);
  });

  it("submits a review for a product", async () => {
    const payload = { rating: 5, comment: "Smooth exchange on campus." };
    api.post.mockResolvedValue({ data: { id: "r2", ...payload } });

    const result = await createReview("prod123", payload);
    expect(api.post).toHaveBeenCalledWith("/products/prod123/reviews", payload);
    expect(result.rating).toBe(5);
  });

  it("updates an existing review", async () => {
    const payload = { rating: 4, comment: "Updated comment." };
    api.put.mockResolvedValue({ data: { id: "r2", ...payload } });

    const result = await updateReview("r2", payload);
    expect(api.put).toHaveBeenCalledWith("/reviews/r2", payload);
    expect(result.comment).toBe("Updated comment.");
  });

  it("deletes a review", async () => {
    api.delete.mockResolvedValue({ data: null });

    await deleteReview("r2");
    expect(api.delete).toHaveBeenCalledWith("/reviews/r2");
  });
});
