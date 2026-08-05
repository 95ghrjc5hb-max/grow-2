/**
 * @file GrowClient.js
 * Advanced, Futuristic, and Secure API Client Layer
 */

const API_BASE_URL = 'http://localhost:5000/api';

class ApiClient {
    constructor(baseURL) {
    this.baseURL = baseURL;
    // Base secure headers
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Retrieves auth token centrally.
   * For future highest-security upgrades, replace localStorage with HttpOnly cookies.
   */
  get _token() {
    return localStorage.getItem('token');
  }

  /**
   * Core request handler with timeout and centralized error management
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = { ...this.defaultHeaders, ...options.headers };

    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    // Advanced feature: Request Timeout Protection (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const config = {
      ...options,
      headers,
      signal: controller.signal,
    };

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId); // Clear timeout on successful reach

      if (!response.ok) {
        if (response.status === 401) {
          console.warn('[Security] Unauthorized: Token might be expired or invalid.');
          // Future scope: trigger auto-logout event here
        }
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };

    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`[Timeout] API Request to ${endpoint} took too long and was aborted.`);
      } else {
        console.error(`[API Fetch Failed] Endpoint: ${endpoint} | Reason:`, error.message);
      }
      return { success: false, data: null, message: error.message };
    }
  }

  // Futuristic HTTP Method Helpers
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  }

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
  }
}

// Initialize the Singleton Client
const client = new ApiClient(API_BASE_URL);

// Exporting the Grow Decoupling Object matching your architecture
export const Grow = {
  auth: {
    login: async (email, password) => {
      const response = await client.post('/auth/login', { email, password });
      
      if (response.success && response.data?.token) {
        localStorage.setItem('token', response.data.token);
        return response.data;
      }
      
      return { success: false, error: 'Server connection offline or Invalid credentials' };
    },
    
    signup: async (email, password) => {
      const response = await client.post('/auth/signup', { email, password });
      return response.success ? response.data : { success: false, error: 'Registration failed' };
    }
  },
  
    entities: {
    Conversation: {
      list: async () => {
        const response = await client.get('/conversations');
        // Fallback to empty array to strictly prevent UI crashes like reading 'list' of undefined
        return response.success ? response.data : [];
      },
      update: async (id, payload) => {
        const response = await client.patch(`/conversations/${id}`, payload);
        return response.success ? response.data : { success: false };
      }
    },
    Orders: {
      list: async () => {
        const response = await client.get('/orders');
        return response.success ? response.data : [];
      }
    },
    Channel: {
      list: async () => {
        const response = await client.get('/channels');
        return response.success ? response.data : [];
      }
    },
    BotConfig: {
      list: async () => {
        const response = await client.get('/bot-config');
        return response.success ? response.data : [];
      },
      create: async (payload) => {
        const response = await client.post('/bot-config', payload);
        return response.success ? response.data : null;
      },
      update: async (id, payload) => {
        const response = await client.patch(`/bot-config/${id}`, payload);
        return response.success ? response.data : null;
      }
    }
  }
};
