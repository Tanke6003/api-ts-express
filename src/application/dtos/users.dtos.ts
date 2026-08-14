// src/application/dtos/users.dtos.ts
import { z } from "zod";
import { defineDto, definePagedDto } from "./dto.registry";

export const userDto = defineDto(
  "User",
  z.object({
    id: z.int().meta({ examples: [1] }),
    name: z.string().meta({ examples: ["John Doe"] }),
    email: z.string().nullish().meta({
      description: "Sólo lo informan los drivers cuyo esquema lo tiene (Oracle).",
      examples: ["john@example.com"],
    }),
    phone: z.string().nullish().meta({ examples: ["+52 55 1111 1111"] }),
    wallet: z.number().nullish().meta({ examples: [100] }),
    isClient: z.boolean().optional().meta({
      description: "Los clientes pueden ser titulares de una cita.",
      examples: [true],
    }),
  })
);

export const paginatedUsersDto = definePagedDto("PaginatedUsers", userDto);

export type UserDTO = z.infer<typeof userDto>;

// Reexportados para no romper los imports existentes; su definición vive ahora
// en common.dtos.ts, compartida con el resto de módulos.
export type { PaginationDTO, PaginatedDTO } from "./common.dtos";
