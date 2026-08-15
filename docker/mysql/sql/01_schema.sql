-- =============================================================================
-- Esquema de ejemplo para la integración con MySQL 8.
--
-- Es el gemelo de docker/oracle/sql/01_schema.sql. Tablas, columnas y nombres de
-- constraint se mantienen idénticos a propósito: el mapeo de
-- src/infrastructure/repositories/entities.ts es uno solo para todos los motores,
-- así que cualquier divergencia de nombre rompería el SQL que genera el
-- repositorio genérico contra este.
--
-- Convención que espera ese repositorio:
--   - PK numérica AUTO_INCREMENT -> permite recuperar el id recién insertado
--   - AVAILABLE (0/1)            -> borrado lógico (1 = vivo, 0 = borrado)
--   - CREATED_AT / UPDATED_AT    -> las mantiene el repositorio genérico
--
-- Todo va en InnoDB y utf8mb4: InnoDB porque es el único motor con FK y
-- transacciones —ambas las usa el repositorio—, y utf8mb4 porque el seed lleva
-- acentos y el utf8 histórico de MySQL sólo cubre 3 bytes por carácter.
--
-- Lo ejecuta sola la imagen mysql:8 al inicializar el volumen, contra
-- MYSQL_DATABASE (ver docker-compose.yml).
-- =============================================================================

-- Los DROP van en orden inverso a las FK (primero la hija, luego las padre) para
-- que el script se pueda reaplicar a mano sobre un contenedor ya inicializado
-- sin borrar el volumen ni pelearse con las dependencias.
DROP TABLE IF EXISTS AUDIT_LOG;
DROP TABLE IF EXISTS APPOINTMENTS;
DROP TABLE IF EXISTS BRANCHES;
DROP TABLE IF EXISTS USERS;

-- =============================================================================
-- USERS: personas del sistema. Un usuario con IS_CLIENT = 1 puede ser el titular
-- de una cita; el resto (staff) queda disponible para futuros usos.
--
-- La PK se declara como constraint con nombre en lugar de en línea: MySQL bautiza
-- siempre `PRIMARY` al índice de clave primaria e ignora la etiqueta, pero
-- escribirla mantiene los cuatro esquemas comparables línea a línea.
-- =============================================================================
CREATE TABLE USERS (
  PK_USER     INT           NOT NULL AUTO_INCREMENT,
  NAME        VARCHAR(100)  NOT NULL,
  EMAIL       VARCHAR(150),
  PHONE       VARCHAR(30),
  WALLET      DECIMAL(10, 2),
  IS_CLIENT   TINYINT(1)    NOT NULL DEFAULT 1,
  AVAILABLE   TINYINT(1)    NOT NULL DEFAULT 1,
  CREATED_AT  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UPDATED_AT  DATETIME(3),
  CREATED_BY  VARCHAR(100)  NOT NULL DEFAULT 'System',
  UPDATED_BY  VARCHAR(100),
  CONSTRAINT PK_USERS       PRIMARY KEY (PK_USER),
  CONSTRAINT CK_USERS_CLI   CHECK (IS_CLIENT IN (0, 1)),
  CONSTRAINT CK_USERS_AVAIL CHECK (AVAILABLE IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IX_USERS_AVAILABLE ON USERS (AVAILABLE);

-- =============================================================================
-- BRANCHES: sucursales donde se agendan las citas.
--
-- OPENS_AT / CLOSES_AT siguen siendo texto 'HH:MM' y no TIME: la hora de apertura
-- es un horario de rótulo, no un instante, y así viaja al JSON sin conversiones.
-- =============================================================================
CREATE TABLE BRANCHES (
  PK_BRANCH   INT           NOT NULL AUTO_INCREMENT,
  NAME        VARCHAR(100)  NOT NULL,
  ADDRESS     VARCHAR(200),
  PHONE       VARCHAR(30),
  OPENS_AT    VARCHAR(5)    NOT NULL DEFAULT '09:00',
  CLOSES_AT   VARCHAR(5)    NOT NULL DEFAULT '18:00',
  AVAILABLE   TINYINT(1)    NOT NULL DEFAULT 1,
  CREATED_AT  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UPDATED_AT  DATETIME(3),
  CREATED_BY  VARCHAR(100)  NOT NULL DEFAULT 'System',
  UPDATED_BY  VARCHAR(100),
  CONSTRAINT PK_BRANCHES       PRIMARY KEY (PK_BRANCH),
  CONSTRAINT CK_BRANCHES_AVAIL CHECK (AVAILABLE IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IX_BRANCHES_AVAILABLE ON BRANCHES (AVAILABLE);

-- =============================================================================
-- APPOINTMENTS: la cita. Puede ser de un cliente registrado (FK_CLIENT) o de
-- alguien que llega sin registro, en cuyo caso sólo guardamos GUEST_NAME.
-- CK_APPT_PARTY garantiza que siempre haya al menos uno de los dos, de modo que
-- ninguna cita quede sin titular identificable.
-- =============================================================================
CREATE TABLE APPOINTMENTS (
  PK_APPOINTMENT INT           NOT NULL AUTO_INCREMENT,
  FK_BRANCH      INT           NOT NULL,
  FK_CLIENT      INT,
  GUEST_NAME     VARCHAR(100),
  SCHEDULED_AT   DATETIME(3)   NOT NULL,
  DURATION_MIN   INT           NOT NULL DEFAULT 30,
  STATUS         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  DETAILS        VARCHAR(500),
  AVAILABLE      TINYINT(1)    NOT NULL DEFAULT 1,
  CREATED_AT     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UPDATED_AT     DATETIME(3),
  CREATED_BY     VARCHAR(100)  NOT NULL DEFAULT 'System',
  UPDATED_BY     VARCHAR(100),
  CONSTRAINT PK_APPOINTMENTS  PRIMARY KEY (PK_APPOINTMENT),
  CONSTRAINT FK_APPT_BRANCH   FOREIGN KEY (FK_BRANCH) REFERENCES BRANCHES (PK_BRANCH),
  CONSTRAINT FK_APPT_CLIENT   FOREIGN KEY (FK_CLIENT) REFERENCES USERS (PK_USER),
  CONSTRAINT CK_APPT_STATUS   CHECK (STATUS IN ('PENDING', 'CONFIRMED', 'DONE', 'CANCELLED')),
  CONSTRAINT CK_APPT_DURATION CHECK (DURATION_MIN BETWEEN 5 AND 1440),
  CONSTRAINT CK_APPT_AVAIL    CHECK (AVAILABLE IN (0, 1)),
  CONSTRAINT CK_APPT_PARTY    CHECK (FK_CLIENT IS NOT NULL OR GUEST_NAME IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FK_BRANCH y FK_CLIENT reciben un índice implícito al declarar la FK, bautizado
-- con el nombre de la constraint. Se crean igualmente a mano para que el juego de
-- índices se llame igual en los cuatro motores: MySQL sustituye el implícito por
-- este en cuanto ve que cubre la FK, así que no queda ninguno duplicado.
CREATE INDEX IX_APPT_BRANCH    ON APPOINTMENTS (FK_BRANCH);
CREATE INDEX IX_APPT_CLIENT    ON APPOINTMENTS (FK_CLIENT);
CREATE INDEX IX_APPT_SCHEDULED ON APPOINTMENTS (SCHEDULED_AT);
CREATE INDEX IX_APPT_AVAILABLE ON APPOINTMENTS (AVAILABLE);

-- Ultima red contra la doble reserva.
--
-- La aplicacion ya serializa el alta bloqueando la sucursal (SELECT ... FOR
-- UPDATE), pero ese bloqueo solo alcanza a las peticiones del mismo proceso:
-- con dos instancias corriendo, la garantia tiene que estar aqui.
--
-- Cubre el mismo inicio exacto, no el solape parcial.
--
-- MySQL no tiene indices parciales ni filtrados, asi que "unico solo cuando la
-- cita cuenta" se expresa con una columna generada que vale NULL en el resto de
-- casos: un UNIQUE ignora los NULL, de modo que las canceladas y las dadas de
-- baja no compiten por el hueco.
--
-- SLOT_KEY es una columna de la base y no una propiedad del dominio: no se
-- anade al mapeo de src/infrastructure/repositories/entities.ts, o el
-- repositorio generico intentaria escribirla.
ALTER TABLE APPOINTMENTS
  ADD COLUMN SLOT_KEY VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN AVAILABLE = 1 AND STATUS <> 'CANCELLED'
         THEN CONCAT(FK_BRANCH, '@', DATE_FORMAT(SCHEDULED_AT, '%Y-%m-%d %H:%i:%s'))
    END
  ) STORED,
  ADD UNIQUE INDEX UX_APPT_SLOT (SLOT_KEY);

-- =============================================================================
-- AUDIT_LOG: bitacora de cambios. La escribe el repositorio generico despues de
-- cada escritura, dentro de la misma transaccion que la operacion auditada.
-- No tiene borrado logico a proposito: una linea de auditoria no se borra.
--
-- CHANGES es TEXT (equivalente al CLOB de Oracle y al NVARCHAR(MAX) de T-SQL):
-- guarda el diff serializado, cuyo tamaño no tiene tope razonable.
-- =============================================================================
CREATE TABLE AUDIT_LOG (
  PK_AUDIT    INT           NOT NULL AUTO_INCREMENT,
  ENTITY      VARCHAR(50)   NOT NULL,
  ENTITY_ID   VARCHAR(50),
  ACTION      VARCHAR(20)   NOT NULL,
  CHANGED_BY  VARCHAR(100)  NOT NULL DEFAULT 'System',
  CHANGED_AT  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  REQUEST_ID  VARCHAR(64),
  CHANGES     TEXT,
  CONSTRAINT PK_AUDIT_LOG PRIMARY KEY (PK_AUDIT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IX_AUDIT_ENTITY  ON AUDIT_LOG (ENTITY, ENTITY_ID);
CREATE INDEX IX_AUDIT_REQUEST ON AUDIT_LOG (REQUEST_ID);
