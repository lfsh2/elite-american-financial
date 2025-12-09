import { QueryClient, QueryClientConfig } from "@tanstack/react-query";

const defaultQueryFn = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
  const [endpoint] = queryKey;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/api')) {
    throw new Error(`Invalid query key: ${String(endpoint)}`);
  }

  const response = await fetch(endpoint);
  
  if (!response.ok) {
    throw new Error(`Network response was not ok: ${response.status}`);
  }
  
  return response.json();
};

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
};

export const queryClient = new QueryClient(queryClientConfig);

interface ApiRequestOptions {
  headers?: Record<string, string>;
  on401?: 'throw' | 'returnNull';
}

interface GetQueryFnOptions {
  on401?: 'throw' | 'returnNull';
}

export function getQueryFn(options: GetQueryFnOptions = {}) {
  return async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [endpoint] = queryKey;
    if (typeof endpoint !== 'string') {
      throw new Error(`Invalid query key: ${String(endpoint)}`);
    }

    const response = await fetch(endpoint);
    
    if (response.status === 401 && options.on401 === 'returnNull') {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    
    return response.json();
  };
}

export async function apiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: Record<string, any>,
  options: ApiRequestOptions = {}
) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && options.on401 === 'returnNull') {
    return null;
  }

  if (!response.ok) {
    const error = new Error(`HTTP error! status: ${response.status}`);
    throw error;
  }

  return response;
}