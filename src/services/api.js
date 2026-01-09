import { Config } from "../constants/Config";

class ApiService {
    /**
     * Generic fetch wrapper with timeout and error handling
     * @param {string} endpoint - API endpoint (e.g., '/api/auth/login')
     * @param {object} options - Fetch options (method, headers, body, etc.)
     * @returns {Promise<any>} - JSON response
     */
    async request(endpoint, options = {}) {
        const url = `${Config.API_BASE_URL}${endpoint}`;
        const headers = {
            "Content-Type": "application/json",
            ...options.headers,
        };

        const config = {
            ...options,
            headers,
        };

        // Create a timeout promise
        const timeoutMs = options.timeout || Config.TIMEOUT;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error("Request timed out"));
            }, timeoutMs);
        });

        try {
            const response = await Promise.race([
                fetch(url, config),
                timeoutPromise,
            ]);

            // Check if response is JSON (content-type)
            const contentType = response.headers.get("content-type");
            let data;
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                // Handle HTTP errors
                throw {
                    status: response.status,
                    message: data.message || `HTTP Error ${response.status}`,
                    data,
                };
            }

            return data;
        } catch (error) {
            console.error(`API Request Error [${endpoint}]:`, error);
            throw error; // Re-throw for caller to handle
        }
    }

    get(endpoint, headers = {}) {
        return this.request(endpoint, { method: "GET", headers });
    }

    post(endpoint, body, headers = {}) {
        return this.request(endpoint, {
            method: "POST",
            body: JSON.stringify(body),
            headers,
        });
    }
}

export const api = new ApiService();
