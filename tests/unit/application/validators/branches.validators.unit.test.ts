import {
  branchQuerySchema,
  createBranchSchema,
  updateBranchSchema,
} from "../../../../src/application/validators/branches.validators";

describe("createBranchSchema", () => {
  it("acepta lo mínimo imprescindible", () => {
    expect(createBranchSchema.safeParse({ name: "Centro" }).success).toBe(true);
  });

  it("acepta la ficha completa", () => {
    const result = createBranchSchema.safeParse({
      name: "Centro",
      address: "Av. Juárez 100",
      phone: "+52 55 5000 0001",
      opensAt: "09:00",
      closesAt: "19:00",
    });
    expect(result.success).toBe(true);
  });

  it("exige nombre", () => {
    expect(createBranchSchema.safeParse({}).success).toBe(false);
    expect(createBranchSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createBranchSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("acepta null en los campos opcionales", () => {
    expect(createBranchSchema.safeParse({ name: "C", address: null, phone: null }).success).toBe(
      true
    );
  });

  it.each(["9:00", "25:00", "09:60", "0900", "mañana"])("rechaza el horario %p", (value) => {
    expect(createBranchSchema.safeParse({ name: "C", opensAt: value }).success).toBe(false);
  });

  it.each(["00:00", "09:30", "23:59"])("acepta el horario %p", (value) => {
    expect(createBranchSchema.safeParse({ name: "C", opensAt: value }).success).toBe(true);
  });
});

describe("updateBranchSchema", () => {
  it("permite enviar sólo un campo", () => {
    expect(updateBranchSchema.safeParse({ phone: "555" }).success).toBe(true);
  });

  it("rechaza un cuerpo vacío", () => {
    expect(updateBranchSchema.safeParse({}).success).toBe(false);
  });
});

describe("branchQuerySchema", () => {
  it("aplica los valores por defecto de paginación", () => {
    expect(branchQuerySchema.parse({})).toEqual({ page: 1, limit: 10, withDeleted: false });
  });

  it("convierte los números que llegan como texto", () => {
    expect(branchQuerySchema.parse({ page: "3", limit: "25" })).toMatchObject({
      page: 3,
      limit: 25,
    });
  });

  it("sólo la cadena 'true' activa withDeleted", () => {
    expect(branchQuerySchema.parse({ withDeleted: "true" }).withDeleted).toBe(true);
    expect(branchQuerySchema.parse({ withDeleted: "false" }).withDeleted).toBe(false);
    expect(branchQuerySchema.parse({ withDeleted: "1" }).withDeleted).toBe(false);
  });

  it("acota la paginación a rangos razonables", () => {
    expect(branchQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(branchQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("recorta la búsqueda", () => {
    expect(branchQuerySchema.parse({ search: "  norte  " }).search).toBe("norte");
  });
});
