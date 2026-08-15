// src/application/dtos/index.ts
//
// Punto único desde el que se cargan todos los DTOs.
//
// No es una comodidad: un DTO se publica como componente de OpenAPI al
// ejecutarse su `defineDto`, y eso sólo pasa si el módulo llega a cargarse. El
// resto del código los importa como **tipos**, que TypeScript borra al
// compilar, así que sin este barril el registro se quedaría vacío y la
// documentación sin un solo esquema.
export * from "./common.dtos";
export * from "./users.dtos";
export * from "./branches.dtos";
export * from "./appointments.dtos";
export * from "./system.dtos";
