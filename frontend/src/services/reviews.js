import api from "./api";

export async function getProductReviews(productId) {
  const response = await api.get(`/products/${productId}/reviews`);
  return response.data;
}

export async function getMyReviews() {
  const response = await api.get("/reviews/my");
  return response.data;
}

export async function createReview(productId, data) {
  const response = await api.post(`/products/${productId}/reviews`, data);
  return response.data;
}

export async function updateReview(reviewId, data) {
  const response = await api.put(`/reviews/${reviewId}`, data);
  return response.data;
}

export async function deleteReview(reviewId) {
  const response = await api.delete(`/reviews/${reviewId}`);
  return response.data;
}
