// src/presentation/controllers/parse-id.ts
import { AppError } from "../../core/errors/app-error";

/**
 * Convierte un parámetro de ruta en un id numérico válido.
 *
 * `Number("")` es 0 y `Number(" 1 ")` es 1, así que no basta con `isNaN`:
 * se exige un entero positivo para que `/branches/abc` responda 400 y no acabe
 * consultando por un id absurdo.
 */
export function parseId(raw: string | undefined, resource: string): number {
  const id = Number(raw);

  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new AppError(`Invalid ${resource} ID`, 400);
  }

  return id;
}
