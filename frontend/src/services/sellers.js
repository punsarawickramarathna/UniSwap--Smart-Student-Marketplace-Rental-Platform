import api from "./api";

export async function getSellerReputation(sellerId) {
  const response = await api.get(`/sellers/${sellerId}/reputation`);
  return response.data;
}
