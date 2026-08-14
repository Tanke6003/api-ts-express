import { loadRelated } from "../../../../src/application/queries/include.query";

interface IParent {
  id: number;
  fkChild: number | null;
}
interface IChild {
  pk: number;
  name: string;
}

describe("loadRelated", () => {
  let repository: any;

  beforeEach(() => {
    repository = {
      find: jest.fn().mockResolvedValue([
        { pk: 1, name: "uno" },
        { pk: 2, name: "dos" },
      ]),
    };
  });

  const spec = {
    foreignKey: "fkChild" as const,
    relatedKey: "pk" as const,
    repository,
  };

  it("resuelve el lote con una sola consulta IN (...)", async () => {
    const parents: IParent[] = [
      { id: 1, fkChild: 1 },
      { id: 2, fkChild: 2 },
      { id: 3, fkChild: 1 },
    ];

    const index = await loadRelated<IParent, IChild>(parents, { ...spec, repository });

    // Una consulta para tres padres, y sin repetir el 1.
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(repository.find).toHaveBeenCalledWith({
      where: { pk: { in: [1, 2] } },
      withDeleted: true,
    });
    expect(index.get(1)).toMatchObject({ name: "uno" });
    expect(index.get(2)).toMatchObject({ name: "dos" });
  });

  it("ignora las claves nulas de una relación opcional", async () => {
    await loadRelated<IParent, IChild>(
      [
        { id: 1, fkChild: null },
        { id: 2, fkChild: 2 },
      ],
      { ...spec, repository }
    );

    expect(repository.find).toHaveBeenCalledWith({
      where: { pk: { in: [2] } },
      withDeleted: true,
    });
  });

  it("no consulta nada si no hay claves que resolver", async () => {
    const index = await loadRelated<IParent, IChild>(
      [{ id: 1, fkChild: null }],
      { ...spec, repository }
    );

    expect(repository.find).not.toHaveBeenCalled();
    expect(index.size).toBe(0);
  });

  it("con la lista de padres vacía tampoco consulta", async () => {
    expect((await loadRelated<IParent, IChild>([], { ...spec, repository })).size).toBe(0);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it("permite excluir los relacionados dados de baja", async () => {
    await loadRelated<IParent, IChild>([{ id: 1, fkChild: 1 }], {
      ...spec,
      repository,
      withDeleted: false,
    });

    expect(repository.find).toHaveBeenCalledWith({
      where: { pk: { in: [1] } },
      withDeleted: false,
    });
  });

  it("deja fuera del índice lo que la consulta no devolvió", async () => {
    repository.find.mockResolvedValue([]);

    const index = await loadRelated<IParent, IChild>([{ id: 1, fkChild: 9 }], {
      ...spec,
      repository,
    });

    expect(index.get(9)).toBeUndefined();
  });
});
