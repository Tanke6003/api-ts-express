# Rutas declaradas con decoradores

Un controlador declara sus propias rutas. De esa declaración salen **tres**
cosas a la vez: el enrutado de Express, la validación de la petición y la
documentación de OpenAPI. No hay que escribirlas por separado y no pueden
discrepar entre sí.

`UsersController` es el módulo ya migrado; el resto todavía usa ficheros de
rutas con bloques `@openapi`. Las dos formas conviven.

---

## Cómo se ve

```typescript
@injectable()
@ApiController("/users", { tag: "Users" })
export class UsersController extends BaseController implements IUsersController {
  constructor(
    @inject(TOKENS.IUsersService) private readonly usersService: IUsersService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(context);
  }

  @Get("/", {
    summary: "Listado paginado de usuarios",
    query: paginationSchema,
    responses: { 200: "Lista paginada de usuarios" },
  })
  public getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    // ...
  };

  @Post("/", {
    summary: "Crea un usuario",
    body: createUserSchema,
    responses: { 201: "Usuario creado", 400: "Error de validación" },
  })
  public createUser = async (req: Request, res: Response, next: NextFunction) => {
    // ...
  };
}
```

Y en la raíz de composición, una línea:

```typescript
registerController(
  router,
  UsersController,
  container.resolve<IUsersController>(TOKENS.IUsersController),
  jwt.middleware
);
```

---

## Qué hace cada decorador

| Decorador | Qué declara |
|-----------|-------------|
| `@ApiController(prefix, { tag })` | Prefijo del controlador y etiqueta de Swagger |
| `@Get` `@Post` `@Put` `@Patch` `@Delete` | Verbo y ruta, relativa al prefijo |

Opciones de una ruta:

| Opción | Efecto en el enrutado | Efecto en la documentación |
|--------|----------------------|---------------------------|
| `body` | Monta `validateBody(schema)` | `requestBody` con el esquema JSON del validador |
| `query` | Monta `validateQuery(schema)` | Un `parameter` por propiedad del esquema |
| `params` | — | Un `parameter` de ruta por entrada, obligatorio |
| `public: true` | **No** monta el guard de JWT | Omite `security` y el 401 |
| `use` | Middlewares extra tras la validación | — |
| `summary` / `description` | — | Lo que se lee en Swagger |
| `responses` | — | Códigos y sus descripciones |

La cadena que se monta es siempre la misma, y en este orden:

```
guard de JWT  ->  validación  ->  middlewares propios  ->  manejador
```

La validación va después del guard a propósito: a quien no está autenticado no
se le cuenta qué campos espera el endpoint.

---

## Dos detalles que conviene saber

**Las rutas se declaran sobre propiedades, no sobre métodos.** Los controladores
de este proyecto escriben sus manejadores como funciones flecha (`public getAll =
async (req, res, next) => {}`), lo que ata `this` sin `.bind()`. Un decorador de
propiedad recibe el prototipo y el nombre, que es cuanto hace falta para
registrar; el manejador se toma después de la instancia.

**El orden importa y es el del código.** `/users/:id` declarado antes que
`/users/stats` haría que "stats" se interpretara como un id. Los decoradores se
evalúan en orden de declaración, así que basta con escribir las rutas concretas
antes que las paramétricas, igual que en un fichero de rutas.

---

## Por qué la documentación sale del esquema

El bloque `@openapi` de un fichero de rutas era entre el **71 % y el 77 %** de
sus líneas, y repetía a mano lo que el validador de Zod ya decía. Nada obligaba
a que coincidieran: en cuanto uno cambiaba, el otro mentía en silencio.

Ahora el `parameters` y el `requestBody` se generan con `z.toJSONSchema()` sobre
el mismo esquema que valida la petición. Si el validador dice que `limit` llega
hasta 100, eso es lo que documenta, porque es literalmente el mismo objeto.

Un par de decisiones técnicas detrás:

- **Se genera en modo `input`.** La documentación describe lo que manda el
  cliente, no lo que el validador devuelve tras sus `transform`. Es además el
  único modo que funciona con esquemas que transforman —varios de query
  convierten la cadena de la URL a número—; el de salida falla con un
  `Transforms cannot be represented in JSON Schema`.
- **El documento es OpenAPI 3.1**, no 3.0. El esquema de 3.1 *es* JSON Schema
  2020-12, que es justo lo que emite Zod. Con 3.0 habría que traducir cada
  esquema a sus diferencias (`nullable`, `exclusiveMinimum` booleano…), que es
  la clase de código que este cambio existe para eliminar. Swagger UI y Scalar
  soportan 3.1.
- **El 401 no se escribe en cada ruta.** Lo pone el guard, así que lo pone
  también el generador en toda ruta que no sea pública.

---

## Migrar un módulo que aún tiene fichero de rutas

1. Copia cada `app.<verbo>(...)` a su decorador sobre el manejador
   correspondiente del controlador, con el mismo esquema de validación.
2. Traslada el `summary` y los códigos de respuesta del bloque `@openapi` a las
   opciones del decorador. El resto del bloque —parámetros, cuerpo— no se
   traslada: se genera solo.
3. Borra el fichero de rutas y su clase.
4. En `index.route.ts`, cambia la línea `container.resolve(XRoutes).register(router)`
   por `registerController(router, XController, container.resolve(TOKENS.IXController), jwt.middleware)`.

Cuando no quede ningún fichero de rutas, `swagger.config.ts` puede dejar de
listar `./src/presentation/routes/*.ts` en `apis` y swagger-jsdoc deja de hacer
falta para las rutas.

---

## Lo que esto **no** resuelve

El controlador sigue teniendo su `try/catch` y su `Number(req.params.id)` en
cada manejador, y el servicio sigue siendo un pase a través del repositorio. Eso
es otra capa de repetición, y se ataca con un CRUD genérico por encima del
repositorio genérico —igual que `SqlGenericRepository` resolvió el CRUD de la
base—, no con más decoradores.
