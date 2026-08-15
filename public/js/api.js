// public/js/api.js
// Cliente HTTP de la interfaz. Todas las rutas de negocio piden JWT, así que
// aquí se obtiene uno de /api/v1/generate-token y se reintenta una vez si caduca.

/**
 * Prefijo donde vive la API.
 *
 * No está escrito a mano porque el servidor lo puede mover con `API_PREFIX`: se
 * pregunta una vez a `/health/ready`, que lo publica, y se cachea. El valor por
 * defecto cubre el arranque y el caso de que la salud no responda.
 */
const DEFAULT_BASE = "/api/v1";
let basePromise;

function base() {
  basePromise ??= fetch("/health/ready")
    .then((r) => r.json())
    .then((health) => health.apiPrefix || DEFAULT_BASE)
    .catch(() => DEFAULT_BASE);
  return basePromise;
}

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

  const response = await fetch(`${await base()}/generate-token`);
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

/** `path` es relativo a la API: `/users`, no `/api/v1/users`. */
export async function request(path, { method = "GET", body, query } = {}) {
  const url = buildUrl(`${await base()}${path}`, query);
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
  // Salud no cuelga de la versión: el balanceador la sondea igual sea cual sea
  // la versión del contrato que sirva la instancia.
  health: () => fetch("/health/ready").then((r) => r.json()),

  appointments: {
    list: (query) => request("/appointments", { query }),
    stats: (branchId) => request("/appointments/stats", { query: { branchId } }),
    create: (body) => request("/appointments", { method: "POST", body }),
    update: (id, body) => request(`/appointments/${id}`, { method: "PUT", body }),
    softDelete: (id) => request(`/appointments/${id}`, { method: "DELETE" }),
    hardDelete: (id) => request(`/appointments/${id}/hard`, { method: "DELETE" }),
    restore: (id) => request(`/appointments/${id}/restore`, { method: "POST" }),
  },

  branches: {
    list: (query) => request("/branches", { query }),
    create: (body) => request("/branches", { method: "POST", body }),
    update: (id, body) => request(`/branches/${id}`, { method: "PUT", body }),
    softDelete: (id) => request(`/branches/${id}`, { method: "DELETE" }),
    hardDelete: (id) => request(`/branches/${id}/hard`, { method: "DELETE" }),
    restore: (id) => request(`/branches/${id}/restore`, { method: "POST" }),
  },

  users: {
    list: (query) => request("/users", { query }),
    create: (body) => request("/users", { method: "POST", body }),
    update: (id, body) => request(`/users/${id}`, { method: "PUT", body }),
    softDelete: (id) => request(`/users/${id}`, { method: "DELETE" }),
  },
};
