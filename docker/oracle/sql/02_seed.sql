-- =============================================================================
-- Datos de ejemplo. Las fechas se calculan relativas a SYSDATE para que el seed
-- siga teniendo sentido sin importar cuándo se levante el contenedor.
-- =============================================================================

INSERT INTO USERS (NAME, EMAIL, PHONE, IS_CLIENT) VALUES ('John Doe',      'john@example.com',  '+52 55 1111 1111', 1);
INSERT INTO USERS (NAME, EMAIL, PHONE, IS_CLIENT) VALUES ('Jane Smith',    'jane@example.com',  '+52 55 2222 2222', 1);
INSERT INTO USERS (NAME, EMAIL, PHONE, IS_CLIENT) VALUES ('Alice Johnson', 'alice@example.com', '+52 55 3333 3333', 1);
INSERT INTO USERS (NAME, EMAIL, PHONE, IS_CLIENT) VALUES ('Bob Brown',     'bob@example.com',   '+52 55 4444 4444', 0);

INSERT INTO BRANCHES (NAME, ADDRESS, PHONE, OPENS_AT, CLOSES_AT)
VALUES ('Sucursal Centro', 'Av. Juárez 100, Centro', '+52 55 5000 0001', '09:00', '19:00');
INSERT INTO BRANCHES (NAME, ADDRESS, PHONE, OPENS_AT, CLOSES_AT)
VALUES ('Sucursal Norte', 'Blvd. Norte 2450, Lindavista', '+52 55 5000 0002', '10:00', '20:00');
INSERT INTO BRANCHES (NAME, ADDRESS, PHONE, OPENS_AT, CLOSES_AT)
VALUES ('Sucursal Sur', 'Calz. del Hueso 88, Coapa', '+52 55 5000 0003', '08:00', '17:00');

-- Cita de un cliente registrado.
INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS)
VALUES (1, 1, NULL, SYSTIMESTAMP + INTERVAL '1' DAY, 45, 'CONFIRMED', 'Revisión general y cotización.');

INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS)
VALUES (2, 2, NULL, SYSTIMESTAMP + INTERVAL '2' DAY, 30, 'PENDING', 'Seguimiento del contrato 8891.');

-- Citas sin cliente registrado: sólo tenemos el nombre con el que se agendó.
INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS)
VALUES (1, NULL, 'Carlos Méndez (walk-in)', SYSTIMESTAMP + INTERVAL '3' HOUR, 20, 'PENDING', 'Llegó sin cita, pidió informes.');

INSERT INTO APPOINTMENTS (FK_BRANCH, FK_CLIENT, GUEST_NAME, SCHEDULED_AT, DURATION_MIN, STATUS, DETAILS)
VALUES (3, NULL, 'Prospecto telefónico', SYSTIMESTAMP + INTERVAL '5' DAY, 60, 'PENDING', 'Cita agendada por teléfono, aún sin alta como cliente.');

COMMIT;
