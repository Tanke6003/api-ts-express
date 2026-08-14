// src/presentation/routing/router.builder.ts
import type { RequestHandler, Router } from "express";
import { getControllerMetadata, joinPath } from "./route.decorators";
import { validateBody, validateQuery } from "../middlewares/validate.middleware";

/** Manejador que expone el controlador, ya atado a su instancia. */
type Handler = RequestHandler;

/**
 * Monta un controlador decorado sobre un router.
 *
 * Es el único sitio que traduce los metadatos a Express, así que el orden de la
 * cadena se decide aquí una vez y vale para todos los módulos:
 *
 *   guard de JWT -> validación -> middlewares propios -> manejador
 *
 * La validación va después del guard a propósito: a quien no está autenticado
 * no se le cuenta qué campos espera el endpoint.
 *
 * @param type Clase del controlador, de donde salen los metadatos.
 * @param instance Quien atiende de verdad. Va aparte del tipo porque el
 * contenedor resuelve por interfaz, y lo que devuelva puede ser la clase o el
 * doble que haya puesto un test; las rutas son las mismas en los dos casos.
 * @param guard Middleware de autenticación, que se aplica salvo en las rutas
 * marcadas como públicas. Se recibe por parámetro, y no se resuelve aquí del
 * contenedor, para poder montar el router con un doble.
 */
export function registerController(
  router: Router,
  type: new (...args: never[]) => object,
  instance: object,
  guard: RequestHandler
): void {
  const metadata = getControllerMetadata(type);

  if (!metadata) {
    throw new Error(
      `[router] ${type.name} no está decorado con @ApiController; ` +
        "sin metadatos no hay rutas que montar."
    );
  }

  const controller = instance;

  for (const route of metadata.routes) {
    const handler = (controller as Record<string, unknown>)[route.handler];

    if (typeof handler !== "function") {
      throw new Error(
        `[router] ${type.name}.${route.handler} está decorado como ` +
          `${route.method.toUpperCase()} ${route.path} pero no es una función.`
      );
    }

    const chain: Handler[] = [];
    if (!route.public) chain.push(guard);
    if (route.body) chain.push(validateBody(route.body));
    if (route.query) chain.push(validateQuery(route.query));
    if (route.use) chain.push(...route.use);

    // El manejador es una propiedad de instancia (función flecha), así que `this`
    // ya viene atado y no hace falta `.bind()`.
    router[route.method](joinPath(metadata.prefix, route.path), ...chain, handler as Handler);
  }
}
