-- =============================================================================
-- Esquema de ejemplo para la integración con SQL Server.
--
-- Es el gemelo T-SQL de docker/oracle/sql/01_schema.sql. Tablas, columnas y
-- nombres de constraint se mantienen idénticos a propósito: el mapeo de
-- src/infrastructure/repositories/entities.ts es uno solo para los dos motores,
-- así que cualquier divergencia de nombre rompería el SQL que genera el
-- repositorio genérico contra uno de los dos.
--
-- Convención que espera ese repositorio:
--   - PK numérica IDENTITY    -> permite recuperar el id recién insertado
--   - AVAILABLE (0/1)         -> columna de borrado lógico (1 = vivo, 0 = borrado)
--   - CREATED_AT / UPDATED_AT -> las mantiene el repositorio genérico
-- =============================================================================

-- La imagen de SQL Server arranca sólo con las bases de sistema, pero el script
-- también debe poder correr contra una instancia donde testdb ya existe: de ahí
-- el IF en lugar de un CREATE DATABASE a secas.
IF DB_ID('testdb') IS NULL
  CREATE DATABASE testdb;
GO

USE testdb;
GO

-- Los DROP van en orden inverso a las FK (primero la hija, luego las padre) para
-- que el script se pueda reaplicar a mano sobre un contenedor ya inicializado
-- sin borrar el volumen ni pelearse con las dependencias.
DROP TABLE IF EXISTS AUDIT_LOG;
DROP TABLE IF EXISTS APPOINTMENTS;
DROP TABLE IF EXISTS BRANCHES;
DROP TABLE IF EXISTS USERS;
GO

-- =============================================================================
-- USERS: personas del sistema. Un usuario con IS_CLIENT = 1 puede ser el titular
-- de una cita; el resto (staff) queda disponible para futuros usos.
--
-- Donde Oracle usa NUMBER(1) + CHECK para simular un booleano, aquí hay BIT: el
-- tipo ya restringe los valores a 0/1, así que CK_USERS_CLI y CK_USERS_AVAIL son
-- redundantes. Se conservan igualmente para que el juego de constraints se llame
-- igual en los dos motores y comparar esquemas siga siendo trivial.
-- =============================================================================
CREATE TABLE USERS (
  PK_USER     INT            IDENTITY(1,1)                NOT NULL,
  NAME        NVARCHAR(100)                               NOT NULL,
  EMAIL       NVARCHAR(150),
  PHONE       NVARCHAR(30),
  IS_CLIENT   BIT            DEFAULT 1                    NOT NULL,
  AVAILABLE   BIT            DEFAULT 1                    NOT NULL,
  CREATED_AT  DATETIME2      DEFAULT SYSDATETIME()        NOT NULL,
  UPDATED_AT  DATETIME2,
  CREATED_BY  NVARCHAR(100)  DEFAULT 'System'             NOT NULL,
  UPDATED_BY  NVARCHAR(100),
  CONSTRAINT PK_USERS       PRIMARY KEY (PK_USER),
  CONSTRAINT CK_USERS_CLI   CHECK (IS_CLIENT IN (0, 1)),
  CONSTRAINT CK_USERS_AVAIL CHECK (AVAILABLE IN (0, 1))
);
GO

CREATE INDEX IX_USERS_AVAILABLE ON USERS (AVAILABLE);
GO

-- =============================================================================
-- BRANCHES: sucursales donde se agendan las citas.
--
-- OPENS_AT / CLOSES_AT siguen siendo texto 'HH:MM' y no TIME: la hora de apertura
-- es un horario de rótulo, no un instante, y así viaja al JSON sin conversiones.
-- =============================================================================
CREATE TABLE BRANCHES (
  PK_BRANCH   INT            IDENTITY(1,1)                NOT NULL,
  NAME        NVARCHAR(100)                               NOT NULL,
  ADDRESS     NVARCHAR(200),
  PHONE       NVARCHAR(30),
  OPENS_AT    NVARCHAR(5)    DEFAULT '09:00'              NOT NULL,
  CLOSES_AT   NVARCHAR(5)    DEFAULT '18:00'              NOT NULL,
  AVAILABLE   BIT            DEFAULT 1                    NOT NULL,
  CREATED_AT  DATETIME2      DEFAULT SYSDATETIME()        NOT NULL,
  UPDATED_AT  DATETIME2,
  CREATED_BY  NVARCHAR(100)  DEFAULT 'System'             NOT NULL,
  UPDATED_BY  NVARCHAR(100),
  CONSTRAINT PK_BRANCHES       PRIMARY KEY (PK_BRANCH),
  -- Redundante sobre BIT, igual que en USERS; se mantiene por paridad de nombres.
  CONSTRAINT CK_BRANCHES_AVAIL CHECK (AVAILABLE IN (0, 1))
);
GO

CREATE INDEX IX_BRANCHES_AVAILABLE ON BRANCHES (AVAILABLE);
GO

-- =============================================================================
-- APPOINTMENTS: la cita. Puede ser de un cliente registrado (FK_CLIENT) o de
-- alguien que llega sin registro, en cuyo caso sólo guardamos GUEST_NAME.
-- CK_APPT_PARTY garantiza que siempre haya al menos uno de los dos, de modo que
-- ninguna cita quede sin titular identificable.
-- =============================================================================
CREATE TABLE APPOINTMENTS (
  PK_APPOINTMENT INT            IDENTITY(1,1)             NOT NULL,
  FK_BRANCH      INT                                      NOT NULL,
  FK_CLIENT      INT,
  GUEST_NAME     NVARCHAR(100),
  SCHEDULED_AT   DATETIME2                                NOT NULL,
  DURATION_MIN   INT            DEFAULT 30                NOT NULL,
  STATUS         NVARCHAR(20)   DEFAULT 'PENDING'         NOT NULL,
  DETAILS        NVARCHAR(500),
  AVAILABLE      BIT            DEFAULT 1                 NOT NULL,
  CREATED_AT     DATETIME2      DEFAULT SYSDATETIME()     NOT NULL,
  UPDATED_AT     DATETIME2,
  CREATED_BY     NVARCHAR(100)  DEFAULT 'System'          NOT NULL,
  UPDATED_BY     NVARCHAR(100),
  CONSTRAINT PK_APPOINTMENTS  PRIMARY KEY (PK_APPOINTMENT),
  CONSTRAINT FK_APPT_BRANCH   FOREIGN KEY (FK_BRANCH) REFERENCES BRANCHES (PK_BRANCH),
  CONSTRAINT FK_APPT_CLIENT   FOREIGN KEY (FK_CLIENT) REFERENCES USERS (PK_USER),
  CONSTRAINT CK_APPT_STATUS   CHECK (STATUS IN ('PENDING', 'CONFIRMED', 'DONE', 'CANCELLED')),
  CONSTRAINT CK_APPT_DURATION CHECK (DURATION_MIN BETWEEN 5 AND 1440),
  -- Redundante sobre BIT; se mantiene por paridad de nombres con Oracle.
  CONSTRAINT CK_APPT_AVAIL    CHECK (AVAILABLE IN (0, 1)),
  CONSTRAINT CK_APPT_PARTY    CHECK (FK_CLIENT IS NOT NULL OR GUEST_NAME IS NOT NULL)
);
GO

CREATE INDEX IX_APPT_BRANCH    ON APPOINTMENTS (FK_BRANCH);
CREATE INDEX IX_APPT_CLIENT    ON APPOINTMENTS (FK_CLIENT);
CREATE INDEX IX_APPT_SCHEDULED ON APPOINTMENTS (SCHEDULED_AT);
CREATE INDEX IX_APPT_AVAILABLE ON APPOINTMENTS (AVAILABLE);
GO

-- =============================================================================
-- AUDIT_LOG: bitacora de cambios. La escribe el repositorio generico despues de
-- cada escritura, dentro de la misma transaccion que la operacion auditada.
-- No tiene borrado logico a proposito: una linea de auditoria no se borra.
-- =============================================================================
CREATE TABLE AUDIT_LOG (
  PK_AUDIT    INT IDENTITY(1,1)  NOT NULL,
  ENTITY      NVARCHAR(50)       NOT NULL,
  ENTITY_ID   NVARCHAR(50)       NULL,
  ACTION      NVARCHAR(20)       NOT NULL,
  CHANGED_BY  NVARCHAR(100)      NOT NULL CONSTRAINT DF_AUDIT_CHANGED_BY DEFAULT ('System'),
  CHANGED_AT  DATETIME2          NOT NULL CONSTRAINT DF_AUDIT_CHANGED_AT DEFAULT (SYSDATETIME()),
  REQUEST_ID  NVARCHAR(64)       NULL,
  CHANGES     NVARCHAR(MAX)      NULL,
  CONSTRAINT PK_AUDIT_LOG PRIMARY KEY (PK_AUDIT)
);
GO

CREATE INDEX IX_AUDIT_ENTITY  ON AUDIT_LOG (ENTITY, ENTITY_ID);
CREATE INDEX IX_AUDIT_REQUEST ON AUDIT_LOG (REQUEST_ID);
GO
