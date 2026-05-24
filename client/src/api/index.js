import axios from "axios";

// Через прокси CRA (setupProxy.js) — тот же origin, что и https://localhost:3001
const API_BASE = process.env.REACT_APP_API_URL || "/api";

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
  },
});

// Перехватчик запросов: подстановка access-токена (ПР10)
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Перехватчик ответов: автообновление токена (ПР10)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!accessToken || !refreshToken) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken,
        });

        const newAccessToken = response.data.accessToken;
        const newRefreshToken = response.data.refreshToken;

        localStorage.setItem("accessToken", newAccessToken);
        localStorage.setItem("refreshToken", newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

/** Ответ с Redis-кэшем (ПР21): { source, data } → data */
function unwrapResponse(data) {
  if (data && typeof data === "object" && "source" in data && "data" in data) {
    return data.data;
  }
  return data;
}

export function getApiErrorMessage(err, fallback) {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Нет связи с сервером. Запустите backend (cd server → npm start) и проверьте client/.env.development";
  }
  return fallback;
}

// API функции
export const api = {
  register: async (data) => {
    const response = await apiClient.post("/auth/register", data);
    return response.data;
  },
  login: async (data) => {
    const response = await apiClient.post("/auth/login", data);
    return response.data;
  },
  refresh: async (refreshToken) => {
    const response = await apiClient.post("/auth/refresh", { refreshToken });
    return response.data;
  },
  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data;
  },

  getProducts: async () => {
    const response = await apiClient.get("/products");
    return unwrapResponse(response.data);
  },
  getProductById: async (id) => {
    const response = await apiClient.get(`/products/${id}`);
    return unwrapResponse(response.data);
  },
  createProduct: async (product) => {
    const response = await apiClient.post("/products", product);
    return response.data;
  },
  updateProduct: async (id, product) => {
    const response = await apiClient.put(`/products/${id}`, product);
    return response.data;
  },
  deleteProduct: async (id) => {
    await apiClient.delete(`/products/${id}`);
  },

  getUsers: async () => {
    const response = await apiClient.get("/users");
    return unwrapResponse(response.data);
  },
  getUserById: async (id) => {
    const response = await apiClient.get(`/users/${id}`);
    return unwrapResponse(response.data);
  },

  // ПР19 — PostgreSQL
  getPgUsers: async () => {
    const response = await apiClient.get("/pg/users");
    return response.data;
  },
  createPgUser: async (data) => {
    const response = await apiClient.post("/pg/users", data);
    return response.data;
  },
  deletePgUser: async (id) => {
    const response = await apiClient.delete(`/pg/users/${id}`);
    return response.data;
  },

  // ПР20 — MongoDB
  getMongoUsers: async () => {
    const response = await apiClient.get("/mongo/users");
    return response.data;
  },
  createMongoUser: async (data) => {
    const response = await apiClient.post("/mongo/users", data);
    return response.data;
  },
  deleteMongoUser: async (id) => {
    const response = await apiClient.delete(`/mongo/users/${id}`);
    return response.data;
  },
  updateUser: async (id, data) => {
    const response = await apiClient.put(`/users/${id}`, data);
    return response.data;
  },
  toggleBlockUser: async (id) => {
    const response = await apiClient.delete(`/users/${id}`);
    return response.data;
  },
};
