-- =============================================================================
-- Datos de ejemplo para MySQL, gemelos de docker/oracle/sql/02_seed.sql.
--
-- Las fechas se calculan relativas a NOW(3) para que el seed siga teniendo
-- sentido sin importar cuándo se levante el contenedor: si se fijaran literales,
-- las citas nacerían caducadas. Se pide NOW(3) y no NOW() porque las columnas son
-- DATETIME(3) y NOW() truncaría a segundos.
--
-- Se asume que 01_schema.sql acaba de recrear las tablas, así que los
-- AUTO_INCREMENT arrancan en 1 y las FK del bloque de citas pueden ir por literal.
-- =============================================================================

-- El contenedor no trae locale, así que el cliente `mysql` que aplica este
-- fichero negocia latin1 y leería cada byte UTF-8 como un carácter suelto: sin
-- esta línea "Juárez" se guarda como "JuÃ¡rez" en una columna que sí es utf8mb4.
SET NAMES utf8mb4;

-- CREATED_BY se omite a propósito en todos los INSERT: queremos que lo ponga el
-- DEFAULT 'System' y así verificar de paso que el default está bien declarado.
INSERT INTO USERS (NAME, EMAIL, PHONE, IS_CLIENT) VALUES
  ('John Doe',      'john@example.com',  '+52 55 1111 1111', 1),
  ('Jane Smith',    'jane@example.com',  '+52 55 2222 2222', 1),
  ('Alice Johnson', 'alice@example.com', '+52 55 3333 3333', 1),
  ('Bob Brown',     'bob@example.com',   '+52 55 4444 4444', 0);

INSERT INTO BRANCHES (NAME, ADDRESS, PHONE, OPENS_AT, CLOSES_AT) VALUES
  ('Sucursal Centro', 'Av. Juárez 100, Centro',       '+52 55 5000 0001', '09:00', '19:00'),
  ('Sucursal Norte',  'Blvd. Norte 2450, Lindavista', '+52 55 5000 0002', '10:00', '20:00'),
  ('Sucursal Sur',    'Calz. del Hueso 88, Coapa',    '+52 55 5000 0003', '08:00', '17:00');

-- Citas de clientes registrados: GUEST_NAME va nulo porque el titular ya tiene
-- ficha en USERS y duplicar el nombre sería una vía para que ambos divergieran.
INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS) VALUES
  (1, 1, NULL, DATE_ADD(NOW(3), INTERVAL 1 DAY), 45, 'CONFIRMED', 'Revisión general y cotización.'),
  (2, 2, NULL, DATE_ADD(NOW(3), INTERVAL 2 DAY), 30, 'PENDING',   'Seguimiento del contrato 8891.');

-- Citas sin cliente registrado: sólo tenemos el nombre con el que se agendó, y
-- es CK_APPT_PARTY quien impide que se queden también sin él.
INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS) VALUES
  (1, NULL, 'Carlos Méndez (walk-in)', DATE_ADD(NOW(3), INTERVAL 3 HOUR), 20, 'PENDING', 'Llegó sin cita, pidió informes.'),
  (3, NULL, 'Prospecto telefónico',    DATE_ADD(NOW(3), INTERVAL 5 DAY),  60, 'PENDING', 'Cita agendada por teléfono, aún sin alta como cliente.');
