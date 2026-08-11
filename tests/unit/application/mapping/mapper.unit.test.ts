import { createMapper } from "../../../../src/application/mapping/mapper";
import {
  appointmentMapper,
  branchMapper,
  userMapper,
} from "../../../../src/application/mapping/profiles";

interface IThing {
  pkThing: number;
  label: string;
  note?: string | null;
  when?: Date | null;
  active?: boolean;
}

interface ThingDTO {
  id: number;
  label: string;
  note: string | null;
  when: string | null;
  shout: string;
}

const thingMapper = createMapper<IThing, ThingDTO>({
  id: { field: "pkThing", readOnly: true },
  label: "label",
  note: { field: "note", to: (value) => (value ?? null) as string | null },
  when: {
    field: "when",
    to: (value) => (value ? new Date(value as Date).toISOString() : null),
    from: (value) => (value ? new Date(value) : null),
  },
  shout: { computed: (thing) => thing.label.toUpperCase() },
});

const thing: IThing = {
  pkThing: 1,
  label: "hola",
  note: null,
  when: new Date("2026-05-01T10:00:00.000Z"),
  active: true,
};

describe("createMapper", () => {
  describe("toDTO", () => {
    it("renombra, convierte y calcula", () => {
      expect(thingMapper.toDTO(thing)).toEqual({
        id: 1,
        label: "hola",
        note: null,
        when: "2026-05-01T10:00:00.000Z",
        shout: "HOLA",
      });
    });

    it("no arrastra propiedades de la entidad que no estén en el perfil", () => {
      expect(thingMapper.toDTO(thing)).not.toHaveProperty("active");
    });

    it("toDTOList mapea la colección entera", () => {
      expect(thingMapper.toDTOList([thing, { ...thing, pkThing: 2 }]).map((d) => d.id)).toEqual([
        1, 2,
      ]);
    });
  });

  describe("toEntity", () => {
    it("invierte el mapeo y aplica las conversiones de vuelta", () => {
      const entity = thingMapper.toEntity({
        id: 99,
        label: "adios",
        note: "algo",
        when: "2026-05-01T10:00:00.000Z",
        shout: "IGNORADO",
      });

      expect(entity).toEqual({
        label: "adios",
        note: "algo",
        when: new Date("2026-05-01T10:00:00.000Z"),
      });
    });

    // La PK y los campos calculados nunca deben venir del cuerpo de la petición.
    it("deja fuera los campos readOnly y los calculados", () => {
      const entity = thingMapper.toEntity({
        id: 99,
        label: "x",
        note: null,
        when: null,
        shout: "NO",
      });

      expect(entity).not.toHaveProperty("pkThing");
      expect(entity).not.toHaveProperty("shout");
    });
  });

  describe("toPartialEntity", () => {
    it("sólo escribe las claves presentes", () => {
      expect(thingMapper.toPartialEntity({ label: "nuevo" })).toEqual({ label: "nuevo" });
    });

    // Es la diferencia que se olvida al escribirlo a mano: no enviar un campo
    // no es lo mismo que enviarlo vacío.
    it("distingue 'no vino' de 'vino como null'", () => {
      expect(thingMapper.toPartialEntity({ note: null })).toEqual({ note: null });
      expect(thingMapper.toPartialEntity({})).toEqual({});
    });
  });

  it("expone el perfil que se le pasó", () => {
    expect(Object.keys(thingMapper.profile)).toEqual(["id", "label", "note", "when", "shout"]);
  });
});

// Los perfiles reales: fijan el contrato que ven los clientes de la API.
describe("perfiles del proyecto", () => {
  it("userMapper", () => {
    expect(userMapper.toDTO({ pkUser: 1, name: "Ana" })).toEqual({
      id: 1,
      name: "Ana",
      email: null,
      phone: null,
      wallet: null,
      isClient: true,
    });

    expect(userMapper.toPartialEntity({ name: "Ana" })).toEqual({ name: "Ana" });
    expect(userMapper.toEntity({ id: 5, name: "Ana" })).not.toHaveProperty("pkUser");
  });

  it("branchMapper", () => {
    expect(
      branchMapper.toDTO({ pkBranch: 2, name: "Centro", opensAt: "09:00", available: true })
    ).toEqual({
      id: 2,
      name: "Centro",
      address: null,
      phone: null,
      opensAt: "09:00",
      closesAt: undefined,
      available: true,
    });

    // `available` es sólo lectura: se muestra, pero no se escribe desde el DTO.
    expect(branchMapper.toPartialEntity({ name: "X", available: false })).toEqual({ name: "X" });
  });

  it("appointmentMapper convierte la fecha en las dos direcciones", () => {
    const dto = appointmentMapper.toDTO({
      pkAppointment: 3,
      fkBranch: 1,
      fkClient: null,
      guestName: "Walk-in",
      scheduledAt: new Date("2026-05-01T10:00:00.000Z"),
      durationMin: 30,
      status: "PENDING",
      details: null,
      available: true,
    });

    expect(dto).toMatchObject({
      id: 3,
      branchId: 1,
      clientId: null,
      guestName: "Walk-in",
      scheduledAt: "2026-05-01T10:00:00.000Z",
      status: "PENDING",
    });

    expect(
      appointmentMapper.toPartialEntity({ scheduledAt: "2026-05-01T10:00:00.000Z" })
    ).toEqual({ scheduledAt: new Date("2026-05-01T10:00:00.000Z") });
  });
});
