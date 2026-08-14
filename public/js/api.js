// public/js/api.js
// Cliente HTTP de la interfaz. Todas las rutas de negocio piden JWT, así que
// aquí se obtiene uno de /api/generate-token y se reintenta una vez si caduca.

const TOKEN_KEY = "agenda-demo-token";
let token = sessionStorage.getItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, issues) {
    super(message);
    this.status = status;
    /** Errores de validación campo a campo, si el backend los mandó. */
    this.issues = issues ?? [];
  }
}

async function getToken() {
  if (token) return token;

  const response = await fetch("/api/generate-token");
  if (!response.ok) throw new ApiError("No se pudo obtener el token", response.status);

  ({ token } = await response.json());
  sessionStorage.setItem(TOKEN_KEY, token);
  return token;
}

function buildUrl(path, query) {
  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    // Los filtros vacíos no se mandan: el backend los trataría como un valor.
    if (value === undefined || value === null || value === "" || value === false) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function send(url, method, body) {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function request(path, { method = "GET", body, query } = {}) {
  const url = buildUrl(path, query);
  let response = await send(url, method, body);

  // El token dura una hora; si expiró se descarta y se pide otro, una sola vez.
  if (response.status === 401) {
    token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    response = await send(url, method, body);
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      payload?.message || `Error ${response.status}`,
      response.status,
      payload?.errors
    );
  }
  return payload;
}

export const api = {
  health: () => fetch("/health").then((r) => r.json()),

  appointments: {
    list: (query) => request("/api/appointments", { query }),
    stats: (branchId) => request("/api/appointments/stats", { query: { branchId } }),
    create: (body) => request("/api/appointments", { method: "POST", body }),
    update: (id, body) => request(`/api/appointments/${id}`, { method: "PUT", body }),
    softDelete: (id) => request(`/api/appointments/${id}`, { method: "DELETE" }),
    hardDelete: (id) => request(`/api/appointments/${id}/hard`, { method: "DELETE" }),
    restore: (id) => request(`/api/appointments/${id}/restore`, { method: "POST" }),
  },

  branches: {
    list: (query) => request("/api/branches", { query }),
    create: (body) => request("/api/branches", { method: "POST", body }),
    update: (id, body) => request(`/api/branches/${id}`, { method: "PUT", body }),
    softDelete: (id) => request(`/api/branches/${id}`, { method: "DELETE" }),
    hardDelete: (id) => request(`/api/branches/${id}/hard`, { method: "DELETE" }),
    restore: (id) => request(`/api/branches/${id}/restore`, { method: "POST" }),
  },

  users: {
    list: (query) => request("/api/users", { query }),
    create: (body) => request("/api/users", { method: "POST", body }),
    update: (id, body) => request(`/api/users/${id}`, { method: "PUT", body }),
    softDelete: (id) => request(`/api/users/${id}`, { method: "DELETE" }),
  },
};
