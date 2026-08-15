# Rutas declaradas con decoradores

Un controlador declara sus propias rutas. De esa declaración salen **tres**
cosas a la vez: el enrutado de Express, la validación de la petición y la
documentación de OpenAPI. No hay que escribirlas por separado y no pueden
discrepar entre sí.

No queda ningún fichero de rutas ni un solo comentario `@openapi` en el
proyecto. Los seis controladores declaran lo suyo y `routing/index.route.ts`
—setenta líneas— recorre el registro y los monta.

---

## Cómo se ve

```typescript
@injectable()
@ApiController("/users", { tag: "Users", token: TOKENS.IUsersController })
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

Y en la raíz de composición, nada por módulo: `routing/index.route.ts` recorre
el registro y monta lo que encuentre. Lo único que hace falta es que la clase se
cargue, y de eso se encarga su `import`.

```typescript
for (const [type, metadata] of registeredControllers()) {
  registerController(router, type, container.resolve(metadata.token), jwt.middleware);
}
```

---

## Qué hace cada decorador

| Decorador | Qué declara |
|-----------|-------------|
| `@ApiController(prefix, { tag, token })` | Prefijo, etiqueta de Swagger y el token con el que el contenedor resuelve quién atiende |
| `@Get` `@Post` `@Put` `@Patch` `@Delete` | Verbo y ruta, relativa al prefijo |

Opciones de una ruta:

| Opción | Efecto en el enrutado | Efecto en la documentación |
|--------|----------------------|---------------------------|
| `body` | Monta `validateBody(schema)` | `requestBody` con el esquema JSON del validador |
| `requestBody` | — | Cuerpo que no es JSON, descrito a mano: una subida `multipart/form-data` |
| `query` | Monta `validateQuery(schema)` | Un `parameter` por propiedad del esquema |
| `params` | — | Un `parameter` de ruta por entrada, obligatorio |
| `public: true` | **No** monta el guard de JWT | Omite `security` y el 401 |
| `use` | Middlewares extra tras la validación | — |
| `summary` / `description` | — | Lo que se lee en Swagger |
| `responses` | — | Códigos, su descripción y su cuerpo (`ref` a un componente, o `schema` de Zod) |

Un 4xx o 5xx que no describa cuerpo referencia solo el componente
`ErrorResponse`, que es el sobre que devuelve el manejador global de errores.
Así el cliente ve en la documentación el `code` estable sobre el que ramificar y
el `requestId` que citar al soporte.

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

## Añadir un módulo

1. Decora su controlador con `@ApiController("/loquesea", { tag, token })` y
   cada manejador con su verbo.
2. Declara sus DTOs con `defineDto` en `application/dtos/` y añádelos al barril
   `dtos/index.ts`.
3. Añade una línea de `import` en `routing/index.route.ts`, que es lo que
   ejecuta los decoradores y mete el controlador en el registro.

No hay que tocar nada más: ni rutas, ni documentación, ni una tabla de módulos.

## Los DTOs también se declaran una vez

`defineDto("User", z.object({...}))` publica el componente de OpenAPI y
`z.infer` da el tipo de TypeScript. Antes era una interfaz más un bloque
`@openapi` que la repetía en YAML: 168 líneas de comentario en los tres ficheros
de DTOs, sin nada que obligara a que coincidieran.

`definePagedDto("PaginatedUsers", userDto)` envuelve un DTO en la respuesta
paginada de la casa, con el elemento por referencia.

Cuidado con una cosa: un DTO se registra al **cargarse** su módulo, y el resto
del código los importa como tipos, que TypeScript borra al compilar. Por eso
existe el barril `dtos/index.ts` y por eso `swagger.config.ts` lo importa. Un
DTO que no esté en el barril no aparece en la documentación.

---

## Lo que esto **no** resuelve

El controlador sigue teniendo su `try/catch` y su `Number(req.params.id)` en
cada manejador, y en un módulo sin reglas el servicio sigue siendo un pase a
través del repositorio. Eso es otra capa de repetición, y se ataca con un CRUD
genérico por encima del repositorio genérico —igual que `SqlGenericRepository`
resolvió el CRUD de la base—, no con más decoradores.

Lo que sí se quitó por esa vía son las transacciones: `@Transactional()` sobre
el método del servicio, con los repositorios inyectados uniéndose solos a la
transacción abierta. Está en [data-access.md](data-access.md), y el decorador
vive en `application/transactions/` porque no tiene nada que ver con HTTP.
