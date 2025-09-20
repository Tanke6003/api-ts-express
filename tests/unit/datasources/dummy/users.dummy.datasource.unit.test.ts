

import { IUser } from "../../../../src/domain/models/users.model";
import { UsersDummyDataSource } from "../../../../src/infrastructure/datasources/dummy/users.dummy.datasource";


describe("UsersDummyDataSource", () => {
  let dataSource: UsersDummyDataSource;

  beforeEach(() => {
    dataSource = new UsersDummyDataSource();
  });

  // =========================
  // ✅ getAllUsers
  // =========================
  it("should return all available users", async () => {
    const users = await dataSource.getAllUsers();
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u:IUser) => u.available)).toBe(true);
  });

  // =========================
  // ✅ getUserById
  // =========================
  it("should return a user by id if available", async () => {
    const user = await dataSource.getUserById(1);
    expect(user).not.toBeNull();
    expect(user?.pkUser).toBe(1);
  });

  it("should return null if user is not found", async () => {
    const user = await dataSource.getUserById(999);
    expect(user).toBeNull();
  });

  it("should return null if user is deleted (available = false)", async () => {
    await dataSource.deleteUser(2);
    const user = await dataSource.getUserById(2);
    expect(user).toBeNull();
  });

  // =========================
  // ✅ createUser
  // =========================
  it("should create a new user with autoincrement pkUser", async () => {
    const newUser: IUser = { pkUser: 0, name: "Charlie", available: true };

    const result = await dataSource.createUser(newUser);
    expect(result).toBe(true);

    const allUsers = await dataSource.getAllUsers();
    const created = allUsers.find((u: { name: string; }) => u.name === "Charlie");
    expect(created).toBeDefined();
    expect(created?.pkUser).toBeGreaterThan(4); // autoincremental
  });

  // =========================
  // ✅ updateUser
  // =========================
  it("should update user name if user exists", async () => {
    const result = await dataSource.updateUser(1, { name: "Updated Name" });
    expect(result).toBe(true);

    const updated = await dataSource.getUserById(1);
    expect(updated?.name).toBe("Updated Name");
  });

  it("should return false if updating non-existent user", async () => {
    const result = await dataSource.updateUser(999, { name: "Nope" });
    expect(result).toBe(false);
  });

  // =========================
  // ✅ deleteUser
  // =========================
  it("should mark user as unavailable instead of removing", async () => {
    const result = await dataSource.deleteUser(3);
    expect(result).toBe(true);

    const deleted = await dataSource.getUserById(3);
    expect(deleted).toBeNull();

    const allUsers = await dataSource.getAllUsers();
    expect(allUsers.find((u: { pkUser: number; }) => u.pkUser === 3)).toBeUndefined();
  });

  it("should return false when deleting non-existent user", async () => {
    const result = await dataSource.deleteUser(999);
    expect(result).toBe(false);
  });
});
