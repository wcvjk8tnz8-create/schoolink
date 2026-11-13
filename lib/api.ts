export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  let data: unknown = {};
  try { data = await res.json(); } catch { /* noop */ }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const post = <T = Record<string, unknown>>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const patch = <T = Record<string, unknown>>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });

export const del = <T = Record<string, unknown>>(path: string) =>
  api<T>(path, { method: "DELETE" });

export async function uploadFile(file: File): Promise<{
  ok: boolean; key: string; url: string; name: string; size: number; mime: string;
}> {
  const form = new FormData();
  form.append("file", file);
  return api<{ ok: boolean; key: string; url: string; name: string; size: number; mime: string }>(
    "/api/upload", { method: "POST", body: form },
  );
}
