// =============================================================================
// Esquema y datos de ejemplo para la integración con MongoDB.
//
// Es el gemelo de docker/oracle/sql/01_schema.sql + 02_seed.sql. MongoDB no tiene
// DDL, pero sí validación de esquema por colección: cada $jsonSchema de aquí
// reproduce lo que allí son tipos, NOT NULL y CHECK, de modo que un documento que
// no pasaría por la tabla tampoco entre en la colección.
//
// Los campos van en MAYÚSCULAS (PK_USER, NAME, ...) porque el mapeo de
// src/infrastructure/repositories/entities.ts es uno solo para los cuatro
// motores: si aquí se llamaran pkUser o pk_user, el repositorio genérico leería
// documentos vacíos.
//
// Las PK numéricas las asigna la aplicación —no hay IDENTITY ni AUTO_INCREMENT—,
// así que el seed las inserta explícitas (1..4, 1..3, 1..4) igual que harían las
// secuencias de los otros motores tras un esquema recién creado. Se les pone
// índice único para que la unicidad no dependa sólo de la buena fe del emisor.
//
// La imagen mongo:7 ejecuta este archivo con mongosh contra MONGO_INITDB_DATABASE
// durante la primera inicialización del volumen (ver docker-compose.yml).
// =============================================================================

// -----------------------------------------------------------------------------
// Réplica de un solo nodo.
//
// Las transacciones multi-documento —que el repositorio genérico usa para
// escribir la operación y su línea de AUDIT_LOG de forma atómica— sólo existen
// sobre un replica set: un mongod suelto no tiene oplog y rechaza startTransaction.
// De ahí el `--replSet rs0` del compose y este rs.initiate().
//
// Hay que iniciarla aquí, y no después, porque el mongod temporal que levanta el
// entrypoint para correr estos scripts también arranca con --replSet: mientras la
// réplica no esté iniciada el nodo no es primario y CUALQUIER escritura de este
// mismo archivo fallaría con NotWritablePrimary.
//
// El miembro se declara como localhost:27017 a propósito: es la única dirección
// válida tanto dentro del contenedor como desde el host a través del puerto
// publicado, así que el descubrimiento de topología funciona en ambos lados.
// -----------------------------------------------------------------------------
try {
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
} catch (e) {
  // AlreadyInitialized (23): el volumen ya traía la réplica configurada.
  if (e.code !== 23 && !/already initialized/i.test(e.message || "")) {
    throw e;
  }
}

// La elección del primario tarda un instante; sin esta espera el primer insert
// llegaría con el nodo todavía en SECONDARY.
for (let i = 0; i < 60 && !db.hello().isWritablePrimary; i++) {
  sleep(500);
}
if (!db.hello().isWritablePrimary) {
  throw new Error("La réplica rs0 no llegó a PRIMARY; se aborta la inicialización.");
}

// Tipos numéricos aceptados. Se listan los tres porque el driver de Node envía los
// enteros de JavaScript como double, mongosh también, y una migración podría
// dejarlos como int o long: exigir uno solo rompería según quién escriba.
const NUMBER = ["int", "long", "double"];
const NUMBER_OR_NULL = ["int", "long", "double", "null"];

// Reaplicable a mano: se borra la colección antes de recrearla, porque
// createCollection falla si ya existe y validator no se puede declarar dos veces.
["AUDIT_LOG", "APPOINTMENTS", "BRANCHES", "USERS"].forEach((name) => {
  if (db.getCollectionNames().indexOf(name) !== -1) {
    db.getCollection(name).drop();
  }
});

// =============================================================================
// USERS: personas del sistema. Un usuario con IS_CLIENT = 1 puede ser el titular
// de una cita; el resto (staff) queda disponible para futuros usos.
//
// IS_CLIENT y AVAILABLE son 0/1 numéricos y no booleanos: el repositorio genérico
// enlaza los flags como números para compartir el mapeo con Oracle, donde son
// NUMBER(1). El `enum` hace aquí el papel de CK_USERS_CLI y CK_USERS_AVAIL.
// =============================================================================
db.createCollection("USERS", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["PK_USER", "NAME", "IS_CLIENT", "AVAILABLE", "CREATED_AT", "CREATED_BY"],
      properties: {
        PK_USER: { bsonType: NUMBER },
        NAME: { bsonType: "string", maxLength: 100 },
        EMAIL: { bsonType: ["string", "null"], maxLength: 150 },
        PHONE: { bsonType: ["string", "null"], maxLength: 30 },
        WALLET: { bsonType: NUMBER_OR_NULL },
        IS_CLIENT: { bsonType: NUMBER, enum: [0, 1] },
        AVAILABLE: { bsonType: NUMBER, enum: [0, 1] },
        CREATED_AT: { bsonType: "date" },
        UPDATED_AT: { bsonType: ["date", "null"] },
        CREATED_BY: { bsonType: "string", maxLength: 100 },
        UPDATED_BY: { bsonType: ["string", "null"], maxLength: 100 },
      },
    },
  },
});

db.USERS.createIndex({ PK_USER: 1 }, { name: "PK_USERS", unique: true });
db.USERS.createIndex({ AVAILABLE: 1 }, { name: "IX_USERS_AVAILABLE" });

// =============================================================================
// BRANCHES: sucursales donde se agendan las citas.
//
// OPENS_AT / CLOSES_AT siguen siendo texto 'HH:MM': la hora de apertura es un
// horario de rótulo, no un instante, y así viaja al JSON sin conversiones.
//
// Son las dos únicas columnas NOT NULL que aquí no van en `required`. En SQL
// llevan DEFAULT ('09:00' y '18:00'), así que un alta que no las envíe —como la
// del endpoint de sucursales— es perfectamente válida y el motor las rellena.
// Un $jsonSchema valida pero no rellena, de modo que exigirlas rechazaría un
// insert que los otros cuatro motores aceptan. El resto de columnas con DEFAULT
// (AVAILABLE, CREATED_AT, CREATED_BY, STATUS, DURATION_MIN) sí siguen siendo
// obligatorias porque el repositorio o el servicio las escriben siempre.
// =============================================================================
db.createCollection("BRANCHES", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["PK_BRANCH", "NAME", "AVAILABLE", "CREATED_AT", "CREATED_BY"],
      properties: {
        PK_BRANCH: { bsonType: NUMBER },
        NAME: { bsonType: "string", maxLength: 100 },
        ADDRESS: { bsonType: ["string", "null"], maxLength: 200 },
        PHONE: { bsonType: ["string", "null"], maxLength: 30 },
        OPENS_AT: { bsonType: "string", maxLength: 5 },
        CLOSES_AT: { bsonType: "string", maxLength: 5 },
        AVAILABLE: { bsonType: NUMBER, enum: [0, 1] },
        CREATED_AT: { bsonType: "date" },
        UPDATED_AT: { bsonType: ["date", "null"] },
        CREATED_BY: { bsonType: "string", maxLength: 100 },
        UPDATED_BY: { bsonType: ["string", "null"], maxLength: 100 },
      },
    },
  },
});

db.BRANCHES.createIndex({ PK_BRANCH: 1 }, { name: "PK_BRANCHES", unique: true });
db.BRANCHES.createIndex({ AVAILABLE: 1 }, { name: "IX_BRANCHES_AVAILABLE" });

// =============================================================================
// APPOINTMENTS: la cita. Puede ser de un cliente registrado (FK_CLIENT) o de
// alguien que llega sin registro, en cuyo caso sólo guardamos GUEST_NAME.
//
// El `anyOf` final es el equivalente de CK_APPT_PARTY: obliga a que llegue uno de
// los dos con valor —no basta con que la clave exista en null—, de modo que
// ninguna cita quede sin titular identificable. Lo que no se puede reproducir son
// FK_APPT_BRANCH y FK_APPT_CLIENT: MongoDB no tiene claves foráneas, así que la
// existencia de la sucursal y del cliente queda del lado de la aplicación.
// =============================================================================
db.createCollection("APPOINTMENTS", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "PK_APPOINTMENT",
        "FK_BRANCH",
        "SCHEDULED_AT",
        "DURATION_MIN",
        "STATUS",
        "AVAILABLE",
        "CREATED_AT",
        "CREATED_BY",
      ],
      properties: {
        PK_APPOINTMENT: { bsonType: NUMBER },
        FK_BRANCH: { bsonType: NUMBER },
        FK_CLIENT: { bsonType: NUMBER_OR_NULL },
        GUEST_NAME: { bsonType: ["string", "null"], maxLength: 100 },
        SCHEDULED_AT: { bsonType: "date" },
        DURATION_MIN: { bsonType: NUMBER, minimum: 5, maximum: 1440 },
        STATUS: { enum: ["PENDING", "CONFIRMED", "DONE", "CANCELLED"] },
        DETAILS: { bsonType: ["string", "null"], maxLength: 500 },
        AVAILABLE: { bsonType: NUMBER, enum: [0, 1] },
        CREATED_AT: { bsonType: "date" },
        UPDATED_AT: { bsonType: ["date", "null"] },
        CREATED_BY: { bsonType: "string", maxLength: 100 },
        UPDATED_BY: { bsonType: ["string", "null"], maxLength: 100 },
      },
      anyOf: [
        { required: ["FK_CLIENT"], properties: { FK_CLIENT: { bsonType: NUMBER } } },
        { required: ["GUEST_NAME"], properties: { GUEST_NAME: { bsonType: "string" } } },
      ],
    },
  },
});

db.APPOINTMENTS.createIndex({ PK_APPOINTMENT: 1 }, { name: "PK_APPOINTMENTS", unique: true });
db.APPOINTMENTS.createIndex({ FK_BRANCH: 1 }, { name: "IX_APPT_BRANCH" });
db.APPOINTMENTS.createIndex({ FK_CLIENT: 1 }, { name: "IX_APPT_CLIENT" });
db.APPOINTMENTS.createIndex({ SCHEDULED_AT: 1 }, { name: "IX_APPT_SCHEDULED" });
db.APPOINTMENTS.createIndex({ AVAILABLE: 1 }, { name: "IX_APPT_AVAILABLE" });

// =============================================================================
// AUDIT_LOG: bitacora de cambios. La escribe el repositorio generico despues de
// cada escritura, dentro de la misma transaccion que la operacion auditada —de
// ahi que la replica no sea opcional.
// No tiene borrado logico a proposito: una linea de auditoria no se borra.
// =============================================================================
db.createCollection("AUDIT_LOG", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["PK_AUDIT", "ENTITY", "ACTION", "CHANGED_BY", "CHANGED_AT"],
      properties: {
        PK_AUDIT: { bsonType: NUMBER },
        ENTITY: { bsonType: "string", maxLength: 50 },
        ENTITY_ID: { bsonType: ["string", "null"], maxLength: 50 },
        ACTION: { bsonType: "string", maxLength: 20 },
        CHANGED_BY: { bsonType: "string", maxLength: 100 },
        CHANGED_AT: { bsonType: "date" },
        REQUEST_ID: { bsonType: ["string", "null"], maxLength: 64 },
        CHANGES: { bsonType: ["string", "null"] },
      },
    },
  },
});

db.AUDIT_LOG.createIndex({ PK_AUDIT: 1 }, { name: "PK_AUDIT_LOG", unique: true });
db.AUDIT_LOG.createIndex({ ENTITY: 1, ENTITY_ID: 1 }, { name: "IX_AUDIT_ENTITY" });
db.AUDIT_LOG.createIndex({ REQUEST_ID: 1 }, { name: "IX_AUDIT_REQUEST" });

// =============================================================================
// Datos de ejemplo, gemelos de docker/oracle/sql/02_seed.sql.
//
// Las fechas se calculan relativas a ahora para que el seed siga teniendo sentido
// sin importar cuándo se levante el contenedor: con literales, las citas nacerían
// caducadas. Los defaults que en SQL pone el motor (AVAILABLE, CREATED_AT,
// CREATED_BY, STATUS) aquí se escriben a mano: un validador rechaza, no rellena.
// =============================================================================
const NOW = new Date();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (ms) => new Date(NOW.getTime() + ms);

db.USERS.insertMany([
  {
    PK_USER: 1,
    NAME: "John Doe",
    EMAIL: "john@example.com",
    PHONE: "+52 55 1111 1111",
    IS_CLIENT: 1,
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_USER: 2,
    NAME: "Jane Smith",
    EMAIL: "jane@example.com",
    PHONE: "+52 55 2222 2222",
    IS_CLIENT: 1,
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_USER: 3,
    NAME: "Alice Johnson",
    EMAIL: "alice@example.com",
    PHONE: "+52 55 3333 3333",
    IS_CLIENT: 1,
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_USER: 4,
    NAME: "Bob Brown",
    EMAIL: "bob@example.com",
    PHONE: "+52 55 4444 4444",
    IS_CLIENT: 0,
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
]);

db.BRANCHES.insertMany([
  {
    PK_BRANCH: 1,
    NAME: "Sucursal Centro",
    ADDRESS: "Av. Juárez 100, Centro",
    PHONE: "+52 55 5000 0001",
    OPENS_AT: "09:00",
    CLOSES_AT: "19:00",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_BRANCH: 2,
    NAME: "Sucursal Norte",
    ADDRESS: "Blvd. Norte 2450, Lindavista",
    PHONE: "+52 55 5000 0002",
    OPENS_AT: "10:00",
    CLOSES_AT: "20:00",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_BRANCH: 3,
    NAME: "Sucursal Sur",
    ADDRESS: "Calz. del Hueso 88, Coapa",
    PHONE: "+52 55 5000 0003",
    OPENS_AT: "08:00",
    CLOSES_AT: "17:00",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
]);

// Las dos primeras son de clientes registrados: GUEST_NAME va nulo porque el
// titular ya tiene ficha en USERS. Las dos últimas llegaron sin registro y sólo
// tienen el nombre con el que se agendaron.
db.APPOINTMENTS.insertMany([
  {
    PK_APPOINTMENT: 1,
    FK_BRANCH: 1,
    FK_CLIENT: 1,
    GUEST_NAME: null,
    SCHEDULED_AT: at(1 * DAY),
    DURATION_MIN: 45,
    STATUS: "CONFIRMED",
    DETAILS: "Revisión general y cotización.",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_APPOINTMENT: 2,
    FK_BRANCH: 2,
    FK_CLIENT: 2,
    GUEST_NAME: null,
    SCHEDULED_AT: at(2 * DAY),
    DURATION_MIN: 30,
    STATUS: "PENDING",
    DETAILS: "Seguimiento del contrato 8891.",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_APPOINTMENT: 3,
    FK_BRANCH: 1,
    FK_CLIENT: null,
    GUEST_NAME: "Carlos Méndez (walk-in)",
    SCHEDULED_AT: at(3 * HOUR),
    DURATION_MIN: 20,
    STATUS: "PENDING",
    DETAILS: "Llegó sin cita, pidió informes.",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
  {
    PK_APPOINTMENT: 4,
    FK_BRANCH: 3,
    FK_CLIENT: null,
    GUEST_NAME: "Prospecto telefónico",
    SCHEDULED_AT: at(5 * DAY),
    DURATION_MIN: 60,
    STATUS: "PENDING",
    DETAILS: "Cita agendada por teléfono, aún sin alta como cliente.",
    AVAILABLE: 1,
    CREATED_AT: NOW,
    UPDATED_AT: null,
    CREATED_BY: "System",
    UPDATED_BY: null,
  },
]);

print(
  "[init] rs0 iniciada; USERS=" +
    db.USERS.countDocuments() +
    " BRANCHES=" +
    db.BRANCHES.countDocuments() +
    " APPOINTMENTS=" +
    db.APPOINTMENTS.countDocuments(),
);
