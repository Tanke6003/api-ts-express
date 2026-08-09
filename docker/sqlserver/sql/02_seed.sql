-- =============================================================================
-- Datos de ejemplo para SQL Server, gemelos de docker/oracle/sql/02_seed.sql.
--
-- Las fechas se calculan relativas a SYSDATETIME() para que el seed siga
-- teniendo sentido sin importar cuándo se levante el contenedor: si se fijaran
-- literales, las citas nacerían caducadas.
--
-- Los literales van con prefijo N porque las columnas son NVARCHAR: sin él, el
-- servidor interpreta la cadena con la code page de la conexión y los acentos
-- de "Juárez" o "Méndez" se pierden antes de llegar a la columna.
--
-- Se asume que 01_schema.sql acaba de recrear las tablas, así que los IDENTITY
-- arrancan en 1 y las FK del bloque de citas pueden ir por literal.
-- =============================================================================

USE testdb;
GO

-- CREATED_BY se omite a propósito en todos los INSERT: queremos que lo ponga el
-- DEFAULT 'System' y así verificar de paso que el default está bien declarado.
INSERT INTO USERS (NAME, EMAIL, PHONE, IS_CLIENT) VALUES
  (N'John Doe',      N'john@example.com',  N'+52 55 1111 1111', 1),
  (N'Jane Smith',    N'jane@example.com',  N'+52 55 2222 2222', 1),
  (N'Alice Johnson', N'alice@example.com', N'+52 55 3333 3333', 1),
  (N'Bob Brown',     N'bob@example.com',   N'+52 55 4444 4444', 0);
GO

INSERT INTO BRANCHES (NAME, ADDRESS, PHONE, OPENS_AT, CLOSES_AT) VALUES
  (N'Sucursal Centro', N'Av. Juárez 100, Centro',        N'+52 55 5000 0001', N'09:00', N'19:00'),
  (N'Sucursal Norte',  N'Blvd. Norte 2450, Lindavista',  N'+52 55 5000 0002', N'10:00', N'20:00'),
  (N'Sucursal Sur',    N'Calz. del Hueso 88, Coapa',     N'+52 55 5000 0003', N'08:00', N'17:00');
GO

-- Citas de clientes registrados: GUEST_NAME va nulo porque el titular ya tiene
-- ficha en USERS y duplicar el nombre sería una vía para que ambos divergieran.
INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS) VALUES
  (1, 1, NULL, DATEADD(DAY, 1, SYSDATETIME()), 45, N'CONFIRMED', N'Revisión general y cotización.'),
  (2, 2, NULL, DATEADD(DAY, 2, SYSDATETIME()), 30, N'PENDING',   N'Seguimiento del contrato 8891.');
GO

-- Citas sin cliente registrado: sólo tenemos el nombre con el que se agendó, y
-- es CK_APPT_PARTY quien impide que se queden también sin él.
INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS) VALUES
  (1, NULL, N'Carlos Méndez (walk-in)', DATEADD(HOUR, 3, SYSDATETIME()), 20, N'PENDING', N'Llegó sin cita, pidió informes.'),
  (3, NULL, N'Prospecto telefónico',    DATEADD(DAY,  5, SYSDATETIME()), 60, N'PENDING', N'Cita agendada por teléfono, aún sin alta como cliente.');
GO
