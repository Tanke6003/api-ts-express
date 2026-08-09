import {
  appointmentQuerySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "../../../../src/application/validators/appointments.validators";

const base = { branchId: 1, scheduledAt: "2026-12-01T10:00:00Z" };

describe("createAppointmentSchema", () => {
  it("acepta una cita de cliente registrado", () => {
    expect(createAppointmentSchema.safeParse({ ...base, clientId: 3 }).success).toBe(true);
  });

  it("acepta una cita de invitado", () => {
    expect(createAppointmentSchema.safeParse({ ...base, guestName: "Walk-in" }).success).toBe(true);
  });

  it("exige cliente o invitado, y apunta el error al campo correcto", () => {
    const result = createAppointmentSchema.safeParse(base);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["guestName"]);
    }
  });

  it("un nombre de invitado en blanco no cuenta", () => {
    expect(createAppointmentSchema.safeParse({ ...base, guestName: "   " }).success).toBe(false);
  });

  it("convierte los ids que llegan como texto", () => {
    const result = createAppointmentSchema.parse({ ...base, branchId: "2", clientId: "3" });

    expect(result).toMatchObject({ branchId: 2, clientId: 3 });
  });

  it("exige sucursal válida", () => {
    expect(createAppointmentSchema.safeParse({ ...base, branchId: 0, clientId: 1 }).success).toBe(
      false
    );
    expect(
      createAppointmentSchema.safeParse({ ...base, branchId: "abc", clientId: 1 }).success
    ).toBe(false);
  });

  it("rechaza fechas que no se pueden interpretar", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, scheduledAt: "el martes", clientId: 1 }).success
    ).toBe(false);
  });

  it("acepta el formato del input datetime-local", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, scheduledAt: "2026-12-01T10:00", clientId: 1 })
        .success
    ).toBe(true);
  });

  it("acota la duración al rango que admite la base", () => {
    expect(createAppointmentSchema.safeParse({ ...base, clientId: 1, durationMin: 4 }).success).toBe(
      false
    );
    expect(
      createAppointmentSchema.safeParse({ ...base, clientId: 1, durationMin: 1441 }).success
    ).toBe(false);
    expect(
      createAppointmentSchema.safeParse({ ...base, clientId: 1, durationMin: "45" }).success
    ).toBe(true);
  });

  it("sólo admite los estados conocidos", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, clientId: 1, status: "CONFIRMED" }).success
    ).toBe(true);
    expect(
      createAppointmentSchema.safeParse({ ...base, clientId: 1, status: "INVENTADO" }).success
    ).toBe(false);
  });

  it("limita la longitud del detalle", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, clientId: 1, details: "x".repeat(501) }).success
    ).toBe(false);
  });
});

describe("updateAppointmentSchema", () => {
  // La regla "cliente o invitado" no se puede validar sobre un parche parcial:
  // se comprueba en el servicio, contra la cita ya combinada.
  it("permite un parche con un solo campo", () => {
    expect(updateAppointmentSchema.safeParse({ status: "DONE" }).success).toBe(true);
    expect(updateAppointmentSchema.safeParse({ clientId: null }).success).toBe(true);
  });

  it("rechaza un cuerpo vacío", () => {
    expect(updateAppointmentSchema.safeParse({}).success).toBe(false);
  });

  it("sigue validando el formato de lo que sí llega", () => {
    expect(updateAppointmentSchema.safeParse({ scheduledAt: "ayer" }).success).toBe(false);
  });
});

describe("appointmentQuerySchema", () => {
  it("aplica los valores por defecto", () => {
    expect(appointmentQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      withDeleted: false,
      onlyGuests: false,
    });
  });

  it("convierte filtros numéricos y booleanos", () => {
    expect(
      appointmentQuerySchema.parse({ branchId: "2", clientId: "3", onlyGuests: "true" })
    ).toMatchObject({ branchId: 2, clientId: 3, onlyGuests: true });
  });

  it("valida el rango de fechas", () => {
    expect(appointmentQuerySchema.safeParse({ from: "2026-01-01T00:00:00Z" }).success).toBe(true);
    expect(appointmentQuerySchema.safeParse({ to: "no es fecha" }).success).toBe(false);
  });

  it("rechaza un estado desconocido", () => {
    expect(appointmentQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
  });
});
