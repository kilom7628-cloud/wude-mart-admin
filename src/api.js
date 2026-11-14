/**
 * Wude Mart Admin Console - API Client
 * Connects directly to the FastAPI Wude Mart Backend API.
 */

const DEFAULT_API_BASE = 'https://wude-mart-backend.kilom7628.workers.dev';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('WUDE_API_BASE_URL');
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    if (window.__WUDE_API_BASE_URL__) return window.__WUDE_API_BASE_URL__.replace(/\/+$/, '');
  }
  return DEFAULT_API_BASE;
}

export function setApiBaseUrl(url) {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem('WUDE_API_BASE_URL');
    } else {
      localStorage.setItem('WUDE_API_BASE_URL', url.trim().replace(/\/+$/, ''));
    }
  }
}

export function getAuthToken() {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('wude_admin_token') || localStorage.getItem('wude_admin_token');
  }
  return null;
}

export function setAuthToken(token, user, remember = true) {
  if (typeof window !== 'undefined') {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('wude_admin_token', token);
    storage.setItem('wude_admin_user', JSON.stringify(user));
  }
}

export function clearAuthToken() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('wude_admin_token');
    sessionStorage.removeItem('wude_admin_user');
    localStorage.removeItem('wude_admin_token');
    localStorage.removeItem('wude_admin_user');
  }
}

export function getStoredUser() {
  if (typeof window !== 'undefined') {
    const raw = sessionStorage.getItem('wude_admin_user') || localStorage.getItem('wude_admin_user');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

async function apiRequest(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const token = getAuthToken();

  const headers = new Headers(options.headers || {});

  // Add auth header if token exists and not already set
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set json content type unless body is FormData or already set
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, fetchOptions);

    if (response.status === 401) {
      // Unauthorized or expired token
      clearAuthToken();
      window.dispatchEvent(new CustomEvent('wude:unauthorized'));
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson.detail) {
          errorDetail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch (e) {
        // Fallback to text or status text
      }
      const err = new Error(errorDetail);
      err.status = response.status;
      throw err;
    }

    // 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error(`Cannot connect to backend API at ${baseUrl}. Ensure the FastAPI server is running with CORS enabled.`);
    }
    throw err;
  }
}

export const api = {
  // Health & connection check
  async checkHealth() {
    return apiRequest('/health', { method: 'GET' });
  },

  // Authentication
  async login(email, password) {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    if (res.user && res.user.role !== 'admin') {
      clearAuthToken();
      throw new Error("ACCESS RESTRICTED: Account role is 'customer'. The Admin Console requires an administrator account.");
    }

    setAuthToken(res.access_token, res.user);
    return res;
  },

  // Products
  async getProducts() {
    return apiRequest('/api/products', { method: 'GET' });
  },

  async getProduct(productId) {
    return apiRequest(`/api/products/${productId}`, { method: 'GET' });
  },

  async createProduct({ name, description = '', price, image_url = '', available = true }) {
    return apiRequest('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price),
        image_url: image_url.trim(),
        available: Boolean(available),
      }),
    });
  },

  async updateProduct(productId, updates) {
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.price !== undefined) payload.price = parseFloat(updates.price);
    if (updates.image_url !== undefined) payload.image_url = updates.image_url.trim();
    if (updates.available !== undefined) payload.available = Boolean(updates.available);

    return apiRequest(`/api/admin/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteProduct(productId) {
    return apiRequest(`/api/admin/products/${productId}`, {
      method: 'DELETE',
    });
  },

  // Orders
  async getOrders() {
    return apiRequest('/api/admin/orders', { method: 'GET' });
  },

  async updateOrderStatus(orderId, newStatus) {
    // FastAPI expects Form data for new_status
    const formData = new FormData();
    formData.append('new_status', newStatus);

    return apiRequest(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: formData,
    });
  },

  // Payments & Verification
  async getPayments() {
    return apiRequest('/api/admin/payments', { method: 'GET' });
  },

  async reviewPayment(paymentId, decision, adminNote = '') {
    // decision must be 'approved' or 'rejected'
    return apiRequest(`/api/admin/payments/${paymentId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        admin_note: adminNote.trim(),
      }),
    });
  },

  // Payment Methods Management
  async getPaymentMethods() {
    return apiRequest('/api/admin/payment-methods', { method: 'GET' });
  },

  async createPaymentMethod({ provider_name, account_number, account_name, instructions = '', is_active = true, display_order = 0 }) {
    return apiRequest('/api/admin/payment-methods', {
      method: 'POST',
      body: JSON.stringify({
        provider_name: provider_name.trim(),
        account_number: account_number.trim(),
        account_name: account_name.trim(),
        instructions: instructions.trim(),
        is_active: Boolean(is_active),
        display_order: parseInt(display_order, 10) || 0,
      }),
    });
  },

  async updatePaymentMethod(methodId, updates) {
    const payload = {};
    if (updates.provider_name !== undefined) payload.provider_name = updates.provider_name.trim();
    if (updates.account_number !== undefined) payload.account_number = updates.account_number.trim();
    if (updates.account_name !== undefined) payload.account_name = updates.account_name.trim();
    if (updates.instructions !== undefined) payload.instructions = updates.instructions.trim();
    if (updates.is_active !== undefined) payload.is_active = Boolean(updates.is_active);
    if (updates.display_order !== undefined) payload.display_order = parseInt(updates.display_order, 10) || 0;

    return apiRequest(`/api/admin/payment-methods/${methodId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deletePaymentMethod(methodId) {
    return apiRequest(`/api/admin/payment-methods/${methodId}`, {
      method: 'DELETE',
    });
  },

  // Order & Transaction Messaging
  async getOrderMessages(orderId) {
    return apiRequest(`/api/orders/${orderId}/messages`, { method: 'GET' });
  },

  async sendOrderMessage(orderId, { message, message_type = 'general' }) {
    return apiRequest(`/api/orders/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        message: message.trim(),
        message_type: message_type.trim(),
      }),
    });
  },
};
