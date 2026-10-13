import api from "./api";

export async function getProducts(params = {}) {
  const response = await api.get("/products", { params });
  return response.data;
}

export async function getProduct(id) {
  const response = await api.get(`/products/${id}`);
  return response.data;
}

export async function createProduct(data) {
  const response = await api.post("/products", data);
  return response.data;
}

export async function updateProduct(id, data) {
  const response = await api.put(`/products/${id}`, data);
  return response.data;
}

export async function deleteProduct(id) {
  const response = await api.delete(`/products/${id}`);
  return response.data;
}

export async function uploadProductImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/products/images/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.url;
}

export async function addProductImage(productId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/products/${productId}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function deleteProductImage(productId, imageId) {
  const response = await api.delete(`/products/${productId}/images/${imageId}`);
  return response.data;
}

export async function getCategories() {
  const response = await api.get("/categories");
  return response.data;
}
