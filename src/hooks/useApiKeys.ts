import { useState, useCallback } from "react";
import { useAuth } from "../auth/index.js";

export enum Scope {
  RuntRead = "runt:read",
  RuntExecute = "runt:execute",
}

export type Resource = {
  id: string;
  type: string;
};

export type CreateApiKeyRequest = {
  scopes: Scope[];
  resources?: Resource[];
  expiresAt: string;
  name?: string;
  userGenerated: boolean;
};

export type ApiKey = CreateApiKeyRequest & {
  id: string;
  userId: string;
  revoked: boolean;
};

export type ListApiKeysRequest = {
  limit?: number;
  offset?: number;
};

const API_BASE = "/api/api-keys";

export function useApiKeys() {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makeAuthenticatedRequest = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = accessToken;
      if (!token) {
        throw new Error("No authentication token available");
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    },
    [accessToken]
  );

  const createApiKey = useCallback(
    async (request: CreateApiKeyRequest): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        const response = (await makeAuthenticatedRequest(API_BASE, {
          method: "POST",
          body: JSON.stringify(request),
        })) as { api_key: string };

        return response.api_key;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create API key";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [makeAuthenticatedRequest]
  );

  const listApiKeys = useCallback(
    async (request: ListApiKeysRequest = {}): Promise<ApiKey[]> => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (request.limit) params.set("limit", request.limit.toString());
        if (request.offset) params.set("offset", request.offset.toString());

        const url = `${API_BASE}${params.toString() ? `?${params.toString()}` : ""}`;
        const response = (await makeAuthenticatedRequest(url)) as ApiKey[];

        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to list API keys";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [makeAuthenticatedRequest]
  );

  const getApiKey = useCallback(
    async (keyId: string): Promise<ApiKey> => {
      setLoading(true);
      setError(null);

      try {
        const response = (await makeAuthenticatedRequest(
          `${API_BASE}/${keyId}`
        )) as ApiKey;
        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get API key";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [makeAuthenticatedRequest]
  );

  const deleteApiKey = useCallback(
    async (keyId: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await makeAuthenticatedRequest(`${API_BASE}/${keyId}`, {
          method: "DELETE",
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete API key";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [makeAuthenticatedRequest]
  );

  const revokeApiKey = useCallback(
    async (keyId: string): Promise<ApiKey> => {
      setLoading(true);
      setError(null);

      try {
        const response = (await makeAuthenticatedRequest(
          `${API_BASE}/${keyId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ revoked: true }),
          }
        )) as ApiKey;

        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to revoke API key";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [makeAuthenticatedRequest]
  );

  const smartDeleteOrRevoke = useCallback(
    async (keyId: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // Try delete first, fallback to revoke
        try {
          await makeAuthenticatedRequest(`${API_BASE}/${keyId}`, {
            method: "DELETE",
          });
        } catch {
          // If delete fails, try revoke
          await makeAuthenticatedRequest(`${API_BASE}/${keyId}`, {
            method: "PATCH",
            body: JSON.stringify({ revoked: true }),
          });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to delete or revoke API key";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [makeAuthenticatedRequest]
  );

  const getUserKey = useCallback(async (): Promise<{
    api_key: ApiKey | null;
    key_value: string | null;
    created: boolean;
  }> => {
    setLoading(true);
    setError(null);

    try {
      // First, try to get existing API keys
      const existingKeys = await listApiKeys({});
      const activeKey = existingKeys.find((key) => !key.revoked);

      if (activeKey) {
        // Return existing key without the value
        return {
          api_key: activeKey,
          key_value: null,
          created: false,
        };
      }

      // No active key found, create a new one
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const keyValue = await createApiKey({
        scopes: [Scope.RuntRead, Scope.RuntExecute],
        expiresAt: expiresAt.toISOString(),
        name: "Runtime Agent Key",
        userGenerated: true,
      });

      // Get the created key metadata
      const newKeys = await listApiKeys({});
      const newKey = newKeys.find((key) => !key.revoked);

      return {
        api_key: newKey || null,
        key_value: keyValue,
        created: true,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get user API key";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [listApiKeys, createApiKey]);

  return {
    loading,
    error,
    createApiKey,
    listApiKeys,
    getApiKey,
    deleteApiKey,
    revokeApiKey,
    getUserKey,
    smartDeleteOrRevoke,
  };
}
