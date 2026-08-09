// src/application/dtos/common.dtos.ts

/**
 * DTOs compartidos por todos los módulos. Viven aparte para que un módulo nuevo
 * no tenga que importar desde `users.dtos`.
 */

export interface PaginationDTO {
  page: number;
  limit: number;
}

export interface PaginatedDTO<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
