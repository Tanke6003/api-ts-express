# Plan de endurecimiento y correcciones

Guía de implementación para cinco puntos pendientes. Cada uno lleva el diagnóstico
con su referencia exacta al código, por qué importa, cómo resolverlo y cómo
comprobar que quedó resuelto.

Estado del repo cuando se escribió esto: `tsc --noEmit` limpio, ESLint 0 errores /
22 warnings, 692 tests en verde, 95.2 % statements. Nada de lo que sigue está
aplicado.

## Contexto

Esto es una **plantilla**, y su objetivo declarado es que cambiar de motor sea una
variable de entorno: el día que dejen de pagar Oracle, `DATA_SOURCE=postgres` y
listo. Ese objetivo condiciona las soluciones de aquí, y por eso ninguna propone
resolver nada con algo que sólo hable un motor:

- La regla de solape (punto 2) se garantiza **en la aplicación**, que es la capa
  portátil. El índice de la base es red de seguridad, y se acepta que en cada
  motor se escriba distinto —igual que ya pasa con `SqlDialect`— e incluso que en
  MySQL sea más pobre.
- El bloqueo de fila entra por `SqlDialect`, que es exactamente el sitio que el
  proyecto ya reserva para "lo que cambia entre motores".
- Nada de lo que sigue toca el contrato `IGenericRepository`, salvo el operador
  `contains` del punto 5, que se añade a los tres drivers a la vez.

El módulo de ejemplo (sucursales y citas) y las rutas de desarrollo son
deliberadamente sencillos, y está bien que lo sean: enseñan el patrón. Lo único
que pido de ellos es que no puedan arrancar en producción por descuido —una línea
de guarda— porque quien clone la plantilla heredará lo que haya, no lo que se
quiso decir.

| # | Tema | Riesgo | Esfuerzo |
|---|------|--------|----------|
| 1 | Endurecimiento HTTP — **aplicado** | Alto | 2-3 h |
| 2 | Carrera en `assertSlotIsFree` — **aplicado** | Alto | 4-6 h |
| 3 | Apagado que drena + health real — **aplicado** | Medio | 2 h |
| 4 | Service locator, `app: any`, versionado | Bajo (deuda) | 3-4 h |
| 5 | Escape de `%` y `_` en `ilike` | Bajo | 2 h |

Orden sugerido: **1 → 3 → 5 → 2 → 4**. El 1 y el 3 son aditivos y no rompen nada;
el 5 prepara el terreno tocando el compilador; el 2 es el que más código mueve; el
4 es refactor puro y conviene hacerlo con todo lo demás ya estable.

---

## 1. Endurecimiento HTTP

> **Aplicado.** La política vive en `src/core/config/security.config.ts` y
> `src/core/server.ts` sólo la monta. Las variables nuevas están en
> `.env.template` y en la tabla del `readme.md`. Cubierto por
> `tests/unit/core/config/security.config.unit.test.ts` y cuatro casos nuevos en
> `tests/unit/core/server.unit.test.ts`.
>
> Diferencias con lo que se planteaba abajo: la CSP es una opción (`CSP_ENABLED`,
> apagada por defecto) en vez de quedar simplemente desactivada, `urlencoded` pasó
> a `extended: false`, y la respuesta de CORS expone `x-request-id` para que el
> front pueda leerlo.

### Diagnóstico

En `src/core/server.ts:26-42` (`configureMiddleware`) faltan las defensas que
cualquier despliegue asume:

- `src/core/server.ts:35` — `cors()` sin argumentos: `Access-Control-Allow-Origin: *`
  para cualquier origen. Se ve en la respuesta de los propios tests.
- `src/core/server.ts:33-34` — `express.json({ limit: "50mb" })` y el mismo límite
  en `urlencoded`. 50 MB de JSON por petición es un vector de agotamiento de
  memoria: el parser acumula el cuerpo entero antes de que ningún handler decida
  nada.
- No hay `helmet`: sin `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Strict-Transport-Security` ni CSP.
- No hay rate limiting en ninguna ruta.
- `x-powered-by: Express` viaja en todas las respuestas (visible en los logs de
  los tests de integración).
- `configureSwagger` y `configureScalar` (`src/core/server.ts:44-74`) se montan
  siempre, también con `NODE_ENV=production`, y `/api/openapi.json` es público.

### Por qué importa

El límite de 50 MB probablemente se puso pensando en subidas, pero las subidas de
`test.route.ts` usan `req.pipe(busboy)` y no pasan por `express.json` en ningún
momento: bajarlo no rompe nada. Y el error de cuerpo demasiado grande ya está
mapeado en `src/core/errors/error-mapper.ts:317` (`entity.too.large` → 413
`PAYLOAD_TOO_LARGE`), así que al bajar el límite la respuesta sale con el formato
de error de la API, no con el HTML de Express.

### Cómo resolverlo

**a) Dependencias**

```bash
npm i helmet express-rate-limit
```

Ambos soportan Express 5. Comprueba en el `package.json` resultante que `helmet`
sea 8.x y `express-rate-limit` 7.x o superior.

**b) Variables nuevas**

Añádelas a `.env.template` y documéntalas en la tabla del `readme.md`:

```ini
# CORS: lista separada por comas. Vacío = sólo mismo origen.
CORS_ORIGINS=http://localhost:3001
# Tamaño máximo del cuerpo JSON/urlencoded.
BODY_LIMIT=1mb
# Rate limit global: ventana en ms y peticiones por ventana e IP.
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
# Documentación: por defecto sólo fuera de producción.
DOCS_ENABLED=false
# Saltos de proxy de confianza (0 = ninguno; 1 detrás de un nginx/ALB).
TRUST_PROXY_HOPS=0
```

Amplía `validateCriticalEnvs` (`src/core/config/env.validation.ts:15`) sólo si
decides hacer `CORS_ORIGINS` obligatorio en producción. No hace falta más:
todas tienen valor por defecto razonable.

**c) `configureMiddleware`**

El orden es lo que hay que respetar. Queda así:

1. `this.app.disable("x-powered-by")` — antes de nada. Helmet también lo quita,
   pero explícito cuesta cero y sobrevive a que alguien desactive helmet.
2. `this.app.set("trust proxy", hops)` con `TRUST_PROXY_HOPS`. **Sin esto el rate
   limiter detrás de un proxy agrupa a todo el mundo bajo la IP del proxy** y basta
   un cliente para bloquear a todos. Con un valor numérico (saltos de confianza) y
   no `true`, que confía en cualquier `X-Forwarded-For`.
3. `requestContext(context)` — se queda donde está, primero de la cadena real, por
   el motivo que ya explica el comentario de `server.ts:27-29`.
4. `helmet()`. Si quieres servir el UI de `public/` sin pelearte con la CSP,
   arranca con `helmet({ contentSecurityPolicy: false })` y activa la CSP después,
   cuando la mires con calma: `public/index.html` usa Tailwind por CDN y scripts
   propios, así que la CSP por defecto lo romperá.
5. El rate limiter global.
6. `express.json({ limit })` / `express.urlencoded({ limit, extended: true })` con
   `BODY_LIMIT`.
7. `cors(corsOptions)`.
8. `logger.http()` y `express.static` como están.

El limiter con el formato de error de la casa (`codeForStatus` ya contempla el 429
en `src/core/errors/error-mapper.ts:362`):

```ts
import rateLimit from "express-rate-limit";
import { AppError } from "../core/errors/app-error";

const limiter = rateLimit({
  windowMs: Number(envs.getEnv("RATE_LIMIT_WINDOW_MS")) || 60_000,
  limit: Number(envs.getEnv("RATE_LIMIT_MAX")) || 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError("Demasiadas peticiones", 429, true, { code: "RATE_LIMITED" })),
});
```

Delegar en `next(AppError)` en vez de responder desde el limiter es lo que hace
que un 429 salga con `requestId`, `timestamp` y `code` como el resto de errores.

CORS con lista blanca:

```ts
const allowed = (envs.getEnv("CORS_ORIGINS") || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Sin cabecera Origin: curl, Swagger local, health checks. No es CORS.
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new AppError(`Origen no permitido: ${origin}`, 403, true, { code: "CORS_ORIGIN" }));
  },
  credentials: true,
};
```

Si dejas `allowed` vacío en producción, sólo funcionará el mismo origen — que es
justo lo que quieres si el UI se sirve desde el propio Express. Ojo: `origin: "*"`
y `credentials: true` son incompatibles por especificación; con lista blanca
explícita no tienes ese problema.

**d) Rate limit más estricto donde duele**

Un segundo limiter, mucho más bajo (p. ej. 5 por 15 min por IP), sobre las rutas
que emiten credenciales: hoy `/api/generate-token`
(`src/presentation/routes/test.route.ts:43`) y mañana el login real. Se aplica en
la propia ruta, no global.

**e) Documentación fuera de producción**

En `run()` (`src/core/server.ts:101`), condiciona el montaje:

```ts
const docsEnabled =
  envs.getEnv("DOCS_ENABLED") === "true" || process.env.NODE_ENV !== "production";
if (docsEnabled) {
  await this.configureScalar();
  await this.configureSwagger();
}
```

Detalle que conviene saber antes de decidir: **hoy Swagger en producción sirve una
especificación vacía**. `src/core/config/swagger.config.ts:37` apunta a
`./src/presentation/routes/*.ts`, que no existe en el contenedor de producción
(ahí sólo está `dist/`), y además `tsconfig.json:15` tiene `removeComments: true`,
que borra las anotaciones `@openapi` del compilado. Es decir: montarlo en
producción sólo publica superficie de ataque sin dar documentación. Si algún día
quieres docs en producción, hay que generar el spec en tiempo de build y servir el
JSON estático.

Si prefieres mantenerlas accesibles, la alternativa es ponerles delante
`this.jwtPlugin.middleware` o un basic-auth con credenciales de env, pero mi
recomendación es apagarlas.

### Cómo verificarlo

```bash
# Cabeceras de helmet presentes y x-powered-by ausente
curl -sI http://localhost:3001/health | grep -iE "x-powered-by|x-content-type|referrer"

# CORS rechaza un origen ajeno
curl -si -H "Origin: http://evil.test" http://localhost:3001/api/users | head -1

# El límite de cuerpo responde 413 con el formato de la API
curl -si -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  --data-binary @<(head -c 2000000 /dev/zero | tr '\0' 'a' | sed 's/^/{"name":"/;s/$/"}/') | head -3

# El limiter corta
for i in $(seq 1 130); do curl -so /dev/null -w "%{http_code}\n" http://localhost:3001/health; done | sort | uniq -c
```

Y en `tests/unit/core/server.unit.test.ts`, que ya existe, añade casos con
supertest: 429 tras superar el límite, 403 con `Origin` no permitido, y ausencia
de `/api/swagger` con `NODE_ENV=production`.

---

## 2. Carrera en `assertSlotIsFree`

> **Aplicado.** `ITransactionScope.lockRow` + `SqlDialect.buildRowLock` en los
> cuatro dialectos, `SqlGenericRepository.lockById`, y las tres unidades de
> trabajo. `AppointmentsService.create` y `update` comprueban y escriben dentro
> de la transacción; `BranchesService.softDelete` y `hardDelete` toman el mismo
> bloqueo para no colarse entre medias. Índice único en los cinco esquemas de
> `docker/`, y la violación se traduce al 409 de solape.
>
> Diferencias con lo que se planteaba abajo:
>
> - **Memoria serializa la transacción entera** en vez de bloquear por fila. Con
>   bloqueo por fila el rollback por instantánea seguía roto: dos transacciones
>   solapadas fotografían el mismo estado, y si la segunda falla restaura una
>   foto anterior a lo que la primera ya confirmó, borrándolo.
> - **`update` no toma un segundo bloqueo** cuando la cita se movió de sucursal
>   entre la lectura previa y el bloqueo: responde 409 `APPOINTMENT_MOVED` y pide
>   reintentar. Pedir los dos bloqueos abriría un interbloqueo con quien los pida
>   al revés.
> - **El test de concurrencia por HTTP no prueba la carrera** contra el driver de
>   memoria: sin E/S real cada petición recorre el servicio entera en un mismo
>   turno del bucle de eventos, así que pasa igual con y sin arreglo. La prueba
>   de verdad es la de `MemoryUnitOfWork`, que fuerza el entrelazado con un
>   `setImmediate` — verificada fallando antes del cambio y pasando después.

### Diagnóstico

`src/application/services/appointments.service.ts:240-271` comprueba solapes
leyendo candidatas, y `:129` inserta después. Entre la lectura y la escritura no
hay transacción, ni bloqueo, ni restricción en la base que respalde la regla. Dos
`POST /api/appointments` simultáneos con la misma sucursal y hora pasan los dos la
comprobación y crean las dos citas.

La misma carrera está en `update()` (`:184`), y ahí es peor: la ventana es más
ancha porque antes hace un `getById` y varias validaciones.

El esquema tampoco ayuda: `docker/postgres/sql/01_schema.sql` (y sus gemelos de
oracle/mysql/sqlserver/mongo) define `CK_APPT_STATUS`, `CK_APPT_DURATION` y
`CK_APPT_PARTY`, pero **nada que impida dos citas a la misma hora en la misma
sucursal**. La única defensa es el `find` + `find` de memoria del servicio.

### Por qué importa

Es la regla que el `readme.md` presenta como ejemplo de "una regla de negocio con
un conflicto real". Bajo concurrencia no se cumple, y el síntoma en producción es
doble reserva del mismo hueco: exactamente el fallo que un sistema de citas no
puede tener.

### Cómo resolverlo

Hacen falta dos capas. La de aplicación serializa el caso normal; la de base de
datos es la red de seguridad para cuando corran dos instancias del proceso.

#### Capa A — serializar el chequeo y la inserción (imprescindible)

El patrón: abrir la unidad de trabajo, **bloquear la fila de la sucursal**, y
hacer dentro comprobación e inserción. Bloquear el padre convierte "dos citas de
la misma sucursal" en una cola, y deja pasar en paralelo las de sucursales
distintas, que es la granularidad correcta.

Hoy `ITransactionScope` (`src/domain/interfaces/infrastructure/repositories/unit-of-work.interface.ts:16`)
sólo expone `repository()`, sin primitiva de bloqueo. Hay que añadirla:

1. **Contrato.** Añade a `ITransactionScope`:

   ```ts
   /**
    * Bloquea una fila hasta el commit. Las transacciones que pidan la misma
    * fila esperan, lo que serializa el caso de uso sin bloquear la tabla.
    */
   lockRow(entity: string, id: unknown): Promise<void>;
   ```

2. **Dialecto.** La sintaxis cambia por motor, así que va donde ya vive esa
   variación (`src/infrastructure/repositories/base/dialects/sql.dialect.ts:40`).
   Añade a `SqlDialect`:

   ```ts
   /** SELECT de bloqueo de una fila por PK, con binds `:pk`. */
   buildRowLock(table: string, primaryKeyColumn: string): string;
   ```

   - Oracle: `SELECT ${pk} FROM ${table} WHERE ${pk} = :pk FOR UPDATE`
   - PostgreSQL: igual que Oracle.
   - MySQL: igual que Oracle (InnoDB).
   - SQL Server: `SELECT ${pk} FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE ${pk} = :pk`
     — `FOR UPDATE` no existe en T-SQL; los hints son el equivalente y `HOLDLOCK`
     es lo que mantiene el bloqueo hasta el commit.

3. **Implementaciones de la unidad de trabajo.**
   - `SqlUnitOfWork` (`src/infrastructure/repositories/base/unit-of-work/sql.unit-of-work.ts:57`):
     `lockRow` ejecuta `dialect.buildRowLock(...)` contra el `tx`. Necesitarás
     llegar al schema y al dialecto de la entidad; el registro de repositorios que
     ya tiene (`SqlRepositoryRegistry`) te da el `SqlGenericRepository`, y de ahí
     salen `schema.table`, `schema.primaryKey` y `columnOf`.
   - `MemoryUnitOfWork`: un mutex en proceso por clave `entity:id` (un `Map<string,
     Promise<void>>` encadenando promesas). No es decorativo: el driver de memoria
     es el que usan los tests, y sin esto el test de concurrencia no valida nada.
   - `MongoUnitOfWork`: MongoDB no tiene `SELECT ... FOR UPDATE`. Ahí `lockRow`
     puede ser un no-op documentado y la garantía la da el índice único de la capa
     B, que en Mongo sí es sencillo.

4. **Servicio.** Reescribe `create` para que quede así, en orden:

   ```
   validaciones que no tocan la base (fecha futura, cliente-o-invitado)
   unitOfWork.execute(async (scope) => {
     await scope.lockRow(ENTITY_NAMES.BRANCHES, branchId);
     const branches = scope.repository<IBranch>(ENTITY_NAMES.BRANCHES);
     const appointments = scope.repository<IAppointment>(ENTITY_NAMES.APPOINTMENTS);
     // requireBranch / requireClient con los repos del scope
     // assertSlotIsFree con el repo del scope  <-- ahora dentro del bloqueo
     return appointments.insert({...});
   })
   ```

   `assertSlotIsFree`, `requireBranch` y `requireClient` tienen que aceptar el
   repositorio como parámetro en vez de usar `this.repository`, para poder correr
   tanto dentro como fuera de la transacción. Es el cambio de firma más invasivo
   del punto 2.

   Repite en `update()`: el bloqueo va sobre `merged.fkBranch`, y si la cita
   cambia de sucursal, ordena los bloqueos siempre igual (p. ej. por id
   ascendente) si acabas bloqueando dos, o el sistema puede llegar a un interbloqueo.

5. **Coste.** Esto añade una transacción a un caso de uso que hoy es un `INSERT`
   suelto, y contradice el criterio que documenta
   `unit-of-work.interface.ts:6-14` ("no se abre una transacción por operación").
   Actualiza ese comentario: la excepción no es "escribo en dos tablas" sino
   "decido en función de lo que leo". Merece la pena dejarlo escrito ahí, porque
   es el punto donde alguien lo volverá a quitar por "optimizar".

#### Capa B — restricción en la base

Es la única defensa si mañana corren dos réplicas del proceso. Ojo con lo que
cubre: un índice único sobre `(FK_BRANCH, SCHEDULED_AT)` sólo impide **dos citas
que empiecen exactamente a la misma hora**, no un solape parcial (una de 30 min a
las 10:00 y otra a las 10:15). Es una red de seguridad, no la regla completa.
Sólo PostgreSQL puede expresar el solape real de forma declarativa.

Y hay que filtrar por estado: una cita cancelada o borrada lógicamente no debe
bloquear el hueco.

**PostgreSQL** (`docker/postgres/sql/01_schema.sql`) — índice parcial:

```sql
CREATE UNIQUE INDEX UX_APPT_SLOT ON APPOINTMENTS (FK_BRANCH, SCHEDULED_AT)
  WHERE AVAILABLE = 1 AND STATUS <> 'CANCELLED';
```

Y si quieres la regla completa (solape real, no sólo mismo inicio), con
`btree_gist`:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE APPOINTMENTS ADD CONSTRAINT EX_APPT_OVERLAP
  EXCLUDE USING gist (
    FK_BRANCH WITH =,
    tstzrange(SCHEDULED_AT, SCHEDULED_AT + (DURATION_MIN || ' minutes')::interval) WITH &&
  ) WHERE (AVAILABLE = 1 AND STATUS <> 'CANCELLED');
```

**SQL Server** (`docker/sqlserver/sql/01_schema.sql`) — índice filtrado:

```sql
CREATE UNIQUE INDEX UX_APPT_SLOT ON APPOINTMENTS (FK_BRANCH, SCHEDULED_AT)
  WHERE AVAILABLE = 1 AND STATUS <> 'CANCELLED';
```

**Oracle** (`docker/oracle/sql/01_schema.sql`) — no hay índices parciales, se
emula con uno basado en función (los `NULL` no entran en el índice):

```sql
CREATE UNIQUE INDEX UX_APPT_SLOT ON APPOINTMENTS (
  CASE WHEN AVAILABLE = 1 AND STATUS <> 'CANCELLED' THEN FK_BRANCH END,
  CASE WHEN AVAILABLE = 1 AND STATUS <> 'CANCELLED' THEN SCHEDULED_AT END
);
```

**MySQL 8** (`docker/mysql/sql/01_schema.sql`) — no tiene índices parciales ni
basados en función indexables de esa forma. Opciones: una columna generada que
valga `NULL` cuando la cita no cuenta, y un único sobre ella…

```sql
ALTER TABLE APPOINTMENTS
  ADD COLUMN SLOT_KEY VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN AVAILABLE = 1 AND STATUS <> 'CANCELLED'
         THEN CONCAT(FK_BRANCH, '@', DATE_FORMAT(SCHEDULED_AT, '%Y-%m-%d %H:%i:%s'))
    END
  ) STORED,
  ADD UNIQUE INDEX UX_APPT_SLOT (SLOT_KEY);
```

…o aceptar que en MySQL la garantía es sólo la capa A. Si eliges la columna
generada, no la añadas al mapeo de `entities.ts`: es una columna de la base, no
una propiedad del dominio, y el repositorio genérico intentaría escribirla.

**MongoDB** (`docker/mongo/init/01-init.js`) — índice único parcial:

```js
db.appointments.createIndex(
  { fkBranch: 1, scheduledAt: 1 },
  { unique: true, partialFilterExpression: { available: 1, status: { $ne: "CANCELLED" } } }
);
```

#### Capa C — traducir la violación a un 409 con sentido

El mapeo genérico ya existe: `src/core/errors/error-mapper.ts:53` convierte la
violación de unicidad de los cinco motores en 409 `DB_UNIQUE_VIOLATION` con el
mensaje "Ya existe un registro con esos datos". Para que el cliente vea el mismo
mensaje gane la carrera o la pierda, captura ese caso en el servicio y relanza el
`AppError` de solape que ya escribes en `appointments.service.ts:266`.

### Cómo verificarlo

Test de integración nuevo (corre sobre el driver de memoria, así que necesita el
mutex del punto 3):

```ts
const bodies = Array.from({ length: 10 }, () => ({ ...cita }));
const responses = await Promise.all(bodies.map((b) => request(app).post("/api/appointments").send(b)));
expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
expect(responses.filter((r) => r.status === 409)).toHaveLength(9);
```

Ese test falla hoy con 10 respuestas 201. Escríbelo primero: es el que te dice si
la solución funciona. Repítelo contra Postgres levantando el contenedor, que es
donde de verdad se prueban el bloqueo y el índice.

---

## 3. Apagado que drena y health check real

> **Aplicado.** `Server` guarda el `http.Server`, expone `close()` y `address`,
> y `main.ts` drena en cuatro pasos con temporizador de rescate. El sondeo es
> `HealthProbePlugin` (caché de 3 s, tope de 2 s), registrado en
> `persistence.module` porque ahí está la conexión. Tres rutas: `/health/live`,
> `/health/ready` y `/health` como alias, las tres fuera del rate limiter.
>
> Diferencias con lo que se planteaba abajo:
>
> - **El sondeo entra por el contenedor** (`TOKENS.IHealthProbe`) en vez de
>   exportar un `checkConnection` desde `container.ts`. Importar el contenedor
>   desde `server.ts` habría disparado el registro entero de la DI con sólo
>   importar la clase, y eso rompe los tests que montan el servidor con dobles.
> - **Los `console.log` del arranque** pasaron al logger de paso, que era el
>   punto 3.5 de la lista.
> - **Verificación:** las tres rutas comprobadas contra un servidor real
>   (`DATA_SOURCE=dummy`, puerto 3999) y un test que arranca en un puerto libre,
>   deja una petición a medias, cierra, y comprueba que esa termina con 200
>   mientras las nuevas conexiones se rechazan. En Windows no se puede probar la
>   señal: `SIGTERM` no dispara manejadores de Node, así que la secuencia se
>   prueba en proceso y no por señal.

### Diagnóstico

**Apagado.** `src/core/server.ts:108` llama a `this.app.listen(...)` y tira el
valor devuelto: el `http.Server` no se guarda en ningún sitio. Por eso
`src/main.ts:36-40` sólo puede cerrar el pool de la base y llamar a
`process.exit(0)`. El socket de escucha sigue aceptando conexiones hasta que el
proceso muere, y las peticiones en vuelo se cortan a media respuesta. En un
rolling deploy eso son 502 en cada despliegue.

**Health.** `src/core/server.ts:79-87` responde `{ status: "ok" }` leyendo
`process.env.DATA_SOURCE` y `process.uptime()`. No toca la base. Con la base caída
sigue diciendo `ok`, así que el balanceador manda tráfico a una instancia que va a
fallar todas las peticiones. Un health check que siempre acierta es peor que no
tener ninguno, porque además impide que el orquestador reinicie la instancia.

### Cómo resolverlo

**a) Guardar el servidor y exponer el cierre**

En `Server`:

```ts
private httpServer?: import("http").Server;

async run(): Promise<void> {
  // ... configuración
  this.httpServer = this.app.listen(this.port, () => { /* logs */ });
}

async close(): Promise<void> {
  const server = this.httpServer;
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}
```

Detalle que muerde: con `keep-alive`, `server.close()` **no termina** hasta que
los clientes ociosos cierran su conexión. Node 18.2+ tiene
`server.closeIdleConnections()` — llámalo justo después de `close()` para soltar
las conexiones sin petición en curso, y deja `closeAllConnections()` como último
recurso al vencer el plazo.

Aprovecha y sustituye los `console.log` de `server.ts:109-114` por el logger
inyectado, que es lo que hace el resto del proyecto.

**b) Secuencia de apagado en `main.ts`**

Reemplaza el bucle de `src/main.ts:36-40` por, en este orden:

1. Marca `shuttingDown = true` e **ignora señales repetidas** (un segundo SIGTERM
   mientras drenas no debe reentrar).
2. Pon el health de readiness en "no listo" (ver punto c): el balanceador deja de
   mandar tráfico nuevo unos segundos antes de que dejes de escuchar. Este paso es
   el que de verdad elimina los 502 en Kubernetes.
3. `await server.close()` — deja de aceptar, espera a las peticiones en vuelo.
4. `await shutdownConnections()` — devuelve el pool.
5. `process.exit(0)`.
6. Un `setTimeout(..., SHUTDOWN_TIMEOUT_MS).unref()` que fuerce `process.exit(1)`
   si algo se queda colgado. 10 s es un punto de partida razonable; que sea menor
   que el `terminationGracePeriodSeconds` de tu orquestador.

Añade `SHUTDOWN_TIMEOUT_MS` a `.env.template`.

**c) Health separado en vivacidad y disponibilidad**

Tres rutas, y ninguna de ellas por debajo del rate limiter global (excluye
`/health*` del limiter o los sondeos del balanceador se autobloquean):

| Ruta | Qué comprueba | Respuesta |
|------|---------------|-----------|
| `/health/live` | Sólo que el proceso responde. No toca la base. | Siempre 200 |
| `/health/ready` | La base responde y no estamos drenando. | 200 / 503 |
| `/health` | Alias de `/health/ready`, por compatibilidad. | 200 / 503 |

`/health` tiene que seguir existiendo: lo consume `public/js/api.js:74`.

Para el `ready` hace falta llegar a la conexión. `src/core/di/container.ts:41` ya
guarda `persistence.connection`; exporta al lado de `warmUpConnections` algo así:

```ts
export async function checkConnection(timeoutMs = 2000): Promise<boolean> {
  if (!persistence.connection) return true; // memoria: no hay nada que comprobar
  try {
    await Promise.race([
      persistence.connection.authenticate(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}
```

El `timeout` no es opcional: sin él, un `authenticate()` que se queda esperando
deja el sondeo colgado y el orquestador lo interpreta como fallo… después de su
propio timeout, mucho más tarde de lo que debería.

Cachea el resultado 2-5 segundos en un módulo pequeño. Con un sondeo cada segundo
y varias réplicas, un `authenticate()` por petición es carga real contra la base.

El cuerpo puede conservar lo que ya da hoy (`dataSource`, `uptime`, `timestamp`) y
añadir `database: "up" | "down"`.

### Cómo verificarlo

```bash
# 1. Arranca, lanza una petición lenta y manda SIGTERM a la vez.
#    Debe completar la petición en curso y salir con código 0, sin ECONNRESET.
# 2. Para el contenedor de la base y consulta:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health/ready   # 503
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health/live    # 200
```

En unitarios: `close()` sin `listen()` previo no debe lanzar; `checkConnection`
devuelve `false` cuando `authenticate` rechaza y cuando excede el timeout.

---

## 4. Rutas: service locator, `app: any` y versionado

### Diagnóstico

**a) Service locator.** Las seis clases de rutas resuelven sus dependencias en el
constructor: `src/presentation/routes/users.route.ts:15-16`,
`identity.route.ts:16-17`, `audit.route.ts:15-16`, `test.route.ts:15-16`, y las de
branches y appointments. Eso es localizador de servicios, no inyección: las
dependencias no se ven en la firma, no se pueden sustituir en un test sin montar
el contenedor entero, y se resuelven en el momento de construir la ruta.

**b) `app: any`.** `users.route.ts:19` y `test.route.ts:19` declaran
`register(app: any)`; los otros cuatro ya usan `Router`. Son los dos únicos
warnings de `no-explicit-any` de la capa de presentación.

**c) Sin versionado.** Todo cuelga de `/api` (`src/presentation/routes/index.route.ts:19`).
El día que cambie la forma de una respuesta no hay manera de convivir con los
clientes viejos.

### Cómo resolverlo

**a) Inyección de verdad**

Marca cada clase de rutas con `@injectable()` y declara sus dependencias:

```ts
@injectable()
export class UsersRoutes {
  constructor(
    @inject(TOKENS.IUsersController) private readonly controller: IUsersController,
    @inject(TOKENS.ITokenPlugin) private readonly jwt: ITokenPlugin
  ) {}
  public register(router: Router): void { /* ... */ }
}
```

Y en `index.route.ts`, una única resolución por clase:

```ts
container.resolve(UsersRoutes).register(v1);
```

El contenedor sigue siendo el que resuelve, pero ahora sólo en la raíz de
composición, que es donde debe estar. Un test puede construir `new UsersRoutes(
controllerFake, jwtFake)` sin tocar tsyringe.

**b) Tipar el `register`**

`users.route.ts` es trivial: cambia `any` por `Router`.

`test.route.ts` es `any` porque registra rutas absolutas (`/api/generate-token`) y
`index.route.ts:22` se lo monta sobre la `Application`, no sobre el router de
`/api`. Arréglalo montándolo como los demás: rutas relativas
(`/generate-token`, `/upload-file`, `/upload-files`) sobre el mismo `Router`. Las
URL públicas no cambian, porque ese router ya está montado en `/api`. Con eso
desaparece el caso especial y el comentario de `index.route.ts:21`.

(Recordatorio del repaso anterior: esas rutas no deberían montarse en producción.
Cuando las envuelvas en un `if (NODE_ENV !== "production")`, ten en cuenta que
`public/js/api.js:20` pide el token a `/api/generate-token`, así que el UI de
demostración dejará de funcionar en producción. Es lo correcto: es una demo.)

**c) Versionado**

En `index.route.ts`:

```ts
const v1 = express.Router();
// ...register de cada módulo sobre v1
app.use("/api/v1", v1);
app.use("/api", v1); // alias de compatibilidad; retirar en la próxima mayor
```

Lo que arrastra:

- `public/js/api.js`: saca una constante `const BASE = "/api/v1"` y compón las
  rutas con ella (hoy están escritas a mano en las líneas 77-99).
- Las anotaciones `@openapi` llevan la ruta completa a mano
  (`/api/users`, `/api/appointments`…) en los seis ficheros de rutas. En lugar de
  reescribirlas una por una, añade `servers: [{ url: "/api/v1" }]` en
  `src/core/config/swagger.config.ts:18` y deja las rutas de las anotaciones
  relativas (`/users`). Es un reemplazo mecánico y queda a prueba de la v2.
- Aprovecha para arreglar el `title: "Test API"` y el `version: "1.0.0"`
  hardcodeados de `swagger.config.ts:14-16`: hay `SERVICE_NAME` y `API_VERSION` en
  el entorno y no se usan.

### Cómo verificarlo

`npm run lint` debe quedar sin ningún `no-explicit-any` en `presentation/`.
`/api/users` y `/api/v1/users` deben responder lo mismo. Y los tests de rutas
deben poder construirse sin `container.resolve`.

---

## 5. Escape de `%` y `_` en los patrones `ilike`

### Diagnóstico

Tres sitios interpolan texto del usuario dentro de un patrón LIKE sin escapar los
comodines:

- `src/application/services/appointments.service.ts:96-97` — `details` y `guestName`
- `src/application/services/branches.service.ts:36` — `name` y `address`
- `src/presentation/controllers/audit.controller.ts:37` — `changedBy`

No es inyección: el valor viaja como bind
(`src/infrastructure/repositories/base/query/sql.where.compiler.ts:124`). El
problema es semántico y de rendimiento: `?search=%` produce `LIKE '%%%'`, que
recorre la tabla entera, y `?search=a_b` casa con `axb`, que no es lo que el
usuario pidió.

### Cómo resolverlo

Recomiendo el camino largo, porque el corto deja la trampa puesta para el
siguiente módulo.

**Opción recomendada: un operador `contains`**

Añade `contains?: string` a `FieldOperators`
(`src/domain/interfaces/infrastructure/repositories/generic.repository.interface.ts:30`,
junto a `ilike`) con la semántica "contiene este texto literal, sin distinguir
mayúsculas". Los tres motores lo implementan y quien llama no vuelve a construir
un patrón nunca más:

```ts
// antes
{ name: { ilike: `%${search}%` } }
// después
{ name: { contains: search } }
```

Hay que tocar cuatro sitios:

1. `filter.helpers.ts:8` — añadir `"contains"` a `OPERATOR_KEYS`. **Si te olvidas
   de esto, `isOperatorObject` deja de reconocer el objeto como operadores y lo
   trata como una comparación de igualdad contra un objeto**: el filtro se
   ignora en silencio, sin error.
2. `sql.where.compiler.ts:123` — emitir
   `UPPER(${column}) LIKE UPPER(:bind) ESCAPE '\'` con el valor ya escapado
   (`\` → `\\`, `%` → `\%`, `_` → `\_`) y envuelto en `%…%`. La cláusula `ESCAPE`
   es estándar y la entienden los cuatro motores SQL.
3. `memory.filter.ts:79` — `String(value).toLowerCase().includes(needle.toLowerCase())`.
   Directo, sin pasar por `likeToRegExp`.
4. `mongo.filter.ts:82` — `$regex` con el texto escapado como literal de regex
   (`replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`) y `$options: "i"`. Nada de meter el
   texto del usuario crudo en un `$regex`: ahí sí hay un problema real, porque una
   regex patológica es un ReDoS contra el servidor de Mongo.

**Opción mínima, si prefieres no tocar el contrato**

Un helper `likePattern(raw: string): string` que escape `\`, `%` y `_` y devuelva
`%…%`, usado en los tres sitios, más el `ESCAPE '\'` en el compilador SQL.

Pero **cuidado con el driver de memoria y con Mongo**: los dos pasan por
`likeToRegExp` (`filter.helpers.ts:51`), que traduce `%` → `.*` y `_` → `.`
*después* de escapar los metacaracteres de regex. Un patrón con `\%` acabaría
convertido en "barra invertida seguida de cualquier cosa" y dejaría de casar. Si
tomas este camino, hay que reescribir `likeToRegExp` para que recorra el patrón
carácter a carácter y trate `\x` como literal. Es justo el trabajo que la opción
del operador `contains` te ahorra, y por eso recomiendo la otra.

**Extras baratos mientras estás ahí**

- Limita la longitud del término en los tres validadores. `appointments.validators.ts:61`
  ya tiene `.max(100)`; iguala `branches` y `audit`.
- Un `%` al principio del patrón impide usar cualquier índice B-tree, escapado o
  no. Si la búsqueda va a crecer, en PostgreSQL toca `pg_trgm` con un índice GIN;
  en SQL Server, full-text. Fuera del alcance de este arreglo, pero conviene
  saberlo antes de que la tabla tenga un millón de filas.

### Cómo verificarlo

Casos nuevos en `tests/unit/infrastructure/repositories/base/sql.where.compiler.unit.test.ts`,
`memory.contract.unit.test.ts` y `mongo.filter.unit.test.ts`, todos con la misma
entrada:

| Entrada | Debe casar con | No debe casar con |
|---------|----------------|-------------------|
| `100%` | `"descuento 100% hoy"` | `"100 pesos"` |
| `a_b` | `"xa_by"` | `"axb"` |
| `\` | `"c:\\temp"` | — |

Y uno de contrato: buscar `%` no debe devolver todas las filas.

---

## Lista de comprobación

- [ ] 1.1 `helmet`, `express-rate-limit` instalados y montados en orden
- [ ] 1.2 `trust proxy` configurado por número de saltos
- [ ] 1.3 CORS por lista blanca desde `CORS_ORIGINS`
- [ ] 1.4 `BODY_LIMIT` a 1mb; 413 con el formato de error de la API
- [ ] 1.5 `x-powered-by` desactivado
- [ ] 1.6 Swagger/Scalar/openapi.json fuera de producción
- [ ] 1.7 Limiter estricto en las rutas que emiten tokens
- [ ] 2.1 `lockRow` en `ITransactionScope` + `buildRowLock` en los cuatro dialectos
- [ ] 2.2 Mutex por clave en `MemoryUnitOfWork`
- [ ] 2.3 `create` y `update` de citas dentro de la unidad de trabajo, con bloqueo
- [ ] 2.4 Índice único/exclusión en los cinco esquemas de `docker/`
- [ ] 2.5 `DB_UNIQUE_VIOLATION` traducido al 409 de solape
- [ ] 2.6 Test de 10 POST concurrentes → 1×201, 9×409
- [ ] 3.1 `http.Server` guardado y `Server.close()` expuesto
- [ ] 3.2 Apagado: no listo → close → pool → exit, con timeout de rescate
- [ ] 3.3 `/health/live` y `/health/ready`; `/health` como alias
- [ ] 3.4 `checkConnection` con timeout y caché corta
- [ ] 3.5 `console.log` del arranque sustituidos por el logger
- [ ] 4.1 Clases de rutas `@injectable()` con dependencias en la firma
- [ ] 4.2 `register(router: Router)` en los seis ficheros
- [ ] 4.3 `/api/v1` montado, `/api` como alias, `public/js/api.js` actualizado
- [ ] 4.4 `servers` en swagger + `SERVICE_NAME` / `API_VERSION` reales
- [ ] 5.1 Operador `contains` en el contrato y en los tres drivers
- [ ] 5.2 `"contains"` añadido a `OPERATOR_KEYS`
- [ ] 5.3 Los tres sitios que construyen `%…%` migrados
- [ ] 5.4 Tests con `%`, `_` y `\` en los tres drivers

Al terminar cada bloque: `npm run check` (typecheck + lint + tests). Los umbrales
de cobertura por capa están en `jest.config.js` y el código nuevo tiene que
mantenerlos.
