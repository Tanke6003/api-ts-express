// tests/unit/core/errors/error-mapper.unit.test.ts
//
// La promesa de la plantilla es que un módulo se comporta igual sobre cualquier
// motor. Donde antes se rompía era aquí: sólo se traducían los errores de
// Oracle, así que un duplicado salía 409 en Oracle y 500 en los demás.
//
// Los dobles de esta batería no están inventados: reproducen la forma exacta
// con la que cada driver entrega el error —comprobada contra los cinco motores
// reales—, incluido el envoltorio que pone Sequelize en `parent`/`original` y el
// que pone el repositorio en `cause`.
import { normalizeError } from "../../../../src/core/errors/error-mapper";

/** Error del driver de Oracle: el código va en `code` y en el mensaje. */
const oracle = (codigo: string, mensaje = "") =>
  Object.assign(new Error(`ORA-${codigo}: ${mensaje}`), { code: `ORA-${codigo}` });

/** Error de tedious: `code` genérico y el número de T-SQL en `number`. */
const sqlServer = (numero: number, mensaje = "") =>
  Object.assign(new Error(mensaje), { code: "EREQUEST", number: numero });

/** Error de pg: `code` es el SQLSTATE. */
const postgres = (sqlstate: string, mensaje = "") =>
  Object.assign(new Error(mensaje), { code: sqlstate });

/** Error de mysql2: `errno` numérico y `code` simbólico. */
const mysql = (errno: number, codigo: string, mensaje = "") =>
  Object.assign(new Error(mensaje), { code: codigo, errno, sqlState: "23000" });

/** Error del driver de Mongo: nombre propio y código numérico. */
const mongo = (codigo: number, mensaje = "") =>
  Object.assign(new Error(mensaje), { name: "MongoServerError", code: codigo });

/** Cómo llega de verdad: el repositorio envuelve, y Sequelize envolvió antes. */
const comoLlega = (driver: Error, claseSequelize = "SequelizeDatabaseError") => {
  const envoltorioSequelize = Object.assign(new Error(driver.message), {
    name: claseSequelize,
    parent: driver,
    original: driver,
  });
  return new Error("BranchesRepository.insert failed.", { cause: envoltorioSequelize });
};

describe("normalizeError — errores de driver", () => {
  // =====================================================  paridad  ==========
  // Un mismo fallo del cliente tiene que responder igual en los cinco motores.
  describe("el mismo fallo responde igual venga del motor que venga", () => {
    it("un duplicado es 409 DB_UNIQUE_VIOLATION en todos", () => {
      const casos = [
        new Error("wrap", { cause: oracle("00001", "unique constraint violated") }),
        comoLlega(sqlServer(2627, "Violation of PRIMARY KEY constraint"), "SequelizeUniqueConstraintError"),
        comoLlega(postgres("23505", "duplicate key value violates unique constraint"), "SequelizeUniqueConstraintError"),
        comoLlega(mysql(1062, "ER_DUP_ENTRY", "Duplicate entry '1' for key"), "SequelizeUniqueConstraintError"),
        new Error("wrap", { cause: mongo(11000, "E11000 duplicate key error collection") }),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({
          statusCode: 409,
          code: "DB_UNIQUE_VIOLATION",
          isOperational: true,
        });
      }
    });

    it("un campo obligatorio a null es 400 DB_NOT_NULL_VIOLATION en todos", () => {
      const casos = [
        new Error("wrap", { cause: oracle("01400", "cannot insert NULL") }),
        comoLlega(sqlServer(515, "Cannot insert the value NULL into column 'NAME'")),
        comoLlega(postgres("23502", "null value in column \"name\" violates not-null constraint")),
        comoLlega(mysql(1048, "ER_BAD_NULL_ERROR", "Column 'NAME' cannot be null")),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({
          statusCode: 400,
          code: "DB_NOT_NULL_VIOLATION",
        });
      }
    });

    it("un valor más largo que la columna es 400 DB_VALUE_TOO_LARGE en todos", () => {
      const casos = [
        new Error("wrap", { cause: oracle("12899", "value too large for column") }),
        comoLlega(sqlServer(2628, "String or binary data would be truncated")),
        comoLlega(postgres("22001", "value too long for type character varying(100)")),
        comoLlega(mysql(1406, "ER_DATA_TOO_LONG", "Data too long for column 'NAME'")),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({ statusCode: 400, code: "DB_VALUE_TOO_LARGE" });
      }
    });
  });

  // ============================================  sentido de la clave ajena  ==
  // Oracle y MySQL usan un código por sentido; PostgreSQL y SQL Server reutilizan
  // uno solo, así que hay que mirar el mensaje para no dar el status contrario.
  describe("la dirección de una clave ajena", () => {
    it("apuntar a un padre que no existe es 400", () => {
      const casos = [
        new Error("wrap", { cause: oracle("02291", "parent key not found") }),
        comoLlega(mysql(1452, "ER_NO_REFERENCED_ROW_2", "Cannot add or update a child row")),
        comoLlega(
          postgres("23503", 'insert or update on table "appointments" violates foreign key constraint'),
          "SequelizeForeignKeyConstraintError"
        ),
        comoLlega(
          sqlServer(547, 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_APPT_BRANCH"'),
          "SequelizeForeignKeyConstraintError"
        ),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({
          statusCode: 400,
          code: "DB_REFERENCE_NOT_FOUND",
        });
      }
    });

    it("borrar un padre que aún tiene hijos es 409", () => {
      const casos = [
        new Error("wrap", { cause: oracle("02292", "child record found") }),
        comoLlega(mysql(1451, "ER_ROW_IS_REFERENCED_2", "Cannot delete or update a parent row")),
        comoLlega(postgres("23503", 'is still referenced from table "appointments"')),
        comoLlega(sqlServer(547, "The DELETE statement conflicted with the REFERENCE constraint")),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({
          statusCode: 409,
          code: "DB_REFERENCE_IN_USE",
        });
      }
    });
  });

  // ==========================================================  no disponible ==
  describe("la base no responde", () => {
    it("reconoce los códigos de indisponibilidad de cada motor", () => {
      const casos = [
        new Error("wrap", { cause: oracle("12541", "TNS:no listener") }),
        comoLlega(postgres("57P03", "the database system is starting up")),
        comoLlega(mysql(1042, "ER_GET_HOSTNAME", "Can't get hostname")),
        comoLlega(sqlServer(4060, "Cannot open database")),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({
          statusCode: 503,
          code: "DB_UNAVAILABLE",
          // Es operativo: no hay nada roto en el código, la base no está.
          isOperational: true,
        });
      }
    });

    it("reconoce el fallo de conexión por la clase de Sequelize, sin código", () => {
      const sinCodigo = Object.assign(new Error("connect ECONNREFUSED"), {
        name: "SequelizeConnectionRefusedError",
      });

      expect(normalizeError(new Error("wrap", { cause: sinCodigo }))).toMatchObject({
        statusCode: 503,
        code: "DB_UNAVAILABLE",
      });
    });

    it("reconoce el fallo de red del driver de Mongo", () => {
      const red = Object.assign(new Error("connection timed out"), {
        name: "MongoServerSelectionError",
      });

      expect(normalizeError(red)).toMatchObject({ statusCode: 503, code: "DB_UNAVAILABLE" });
    });

    it("reconoce un socket que ni siquiera abrió", () => {
      const socket = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

      expect(normalizeError(socket)).toMatchObject({ statusCode: 503, code: "DB_UNAVAILABLE" });
    });
  });

  // =====================================================  lo que no es suyo  ==
  describe("lo que no provocó el cliente", () => {
    it("un fallo del motor que no está en la tabla es 500 y no operativo", () => {
      const casos = [
        new Error("wrap", { cause: oracle("00942", "table or view does not exist") }),
        comoLlega(postgres("42601", "syntax error at or near")),
        comoLlega(mysql(1146, "ER_NO_SUCH_TABLE", "Table 'testdb.NOPE' doesn't exist")),
        comoLlega(sqlServer(208, "Invalid object name 'NOPE'")),
      ];

      for (const caso of casos) {
        expect(normalizeError(caso)).toMatchObject({
          statusCode: 500,
          code: "DB_ERROR",
          isOperational: false,
        });
      }
    });

    // El mensaje del motor no debe llegar al cliente: puede nombrar tablas,
    // columnas y restricciones.
    it("no filtra el mensaje del motor", () => {
      const resultado = normalizeError(comoLlega(postgres("42601", "syntax error at or near \"SLECT\"")));

      expect(resultado.message).toBe("Error al acceder a la base de datos.");
    });

    it("un error corriente sigue siendo un 500 genérico", () => {
      expect(normalizeError(new Error("algo se rompió"))).toMatchObject({
        statusCode: 500,
        code: "INTERNAL_ERROR",
        isOperational: false,
      });
    });

    // Un código de sistema de cinco letras no es un SQLSTATE.
    it("no confunde un código de sistema con un SQLSTATE", () => {
      const delSistema = Object.assign(new Error("argument list too long"), { code: "E2BIG" });

      expect(normalizeError(delSistema).code).toBe("INTERNAL_ERROR");
    });
  });

  // ===========================================================  la cadena  ===
  describe("la cadena de causas", () => {
    // Sequelize deja el error del driver en `parent`, no en `cause`, así que
    // seguir sólo las causas nunca llegaría hasta él.
    it("llega al driver a través de parent, no sólo de cause", () => {
      expect(normalizeError(comoLlega(postgres("23505", "duplicate key"))).code).toBe(
        "DB_UNIQUE_VIOLATION"
      );
    });

    it("prefiere el eslabón específico al genérico", () => {
      // El envoltorio de Sequelize no dice nada útil; el de dentro sí.
      const anidado = new Error("capa 1", {
        cause: new Error("capa 2", { cause: comoLlega(mysql(1062, "ER_DUP_ENTRY", "Duplicate entry")) }),
      });

      expect(normalizeError(anidado).code).toBe("DB_UNIQUE_VIOLATION");
    });

    it("no entra en bucle si la cadena se refiere a sí misma", () => {
      const bucle: Error & { parent?: unknown } = new Error("ciclo");
      bucle.parent = bucle;

      expect(normalizeError(bucle).statusCode).toBe(500);
    });
  });
});
