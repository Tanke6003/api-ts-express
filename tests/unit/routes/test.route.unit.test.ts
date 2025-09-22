// tests/unit/routes/test.route.unit.test.ts
import request from "supertest";
import express from "express";
import { S3FileStoragePlugin } from "../../../src/infrastructure/plugins/s3FileStorage.plugin";
import { TestRoutes } from '../../../src/presentation/routes/test.route';

// mock del S3FileStoragePlugin
jest.mock("../../../src/infrastructure/plugins/s3FileStorage.plugin");

describe("TestRoutes (unit)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();

    (S3FileStoragePlugin as jest.Mock).mockImplementation(() => ({
      single: jest.fn().mockResolvedValue("https://fake-bucket.s3.amazonaws.com/file.txt"),
      array: jest.fn().mockResolvedValue([
        "https://fake-bucket.s3.amazonaws.com/file1.txt",
        "https://fake-bucket.s3.amazonaws.com/file2.txt",
      ]),
    }));

    new TestRoutes().register(app);
  });

  it("GET /api/generate-token should return a token", async () => {
    const res = await request(app).get("/api/generate-token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });

  it("POST /api/upload-file should return mocked path", async () => {
    const res = await request(app)
      .post("/api/upload-file")
      .attach("file", Buffer.from("hello"), "file.txt");

    expect(res.status).toBe(200);
    expect(res.body.path).toBe("https://fake-bucket.s3.amazonaws.com/file.txt");
  });

  it("POST /api/upload-files should return mocked paths", async () => {
    const res = await request(app)
      .post("/api/upload-files")
      .attach("files", Buffer.from("one"), "file1.txt")
      .attach("files", Buffer.from("two"), "file2.txt");

    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual([
      "https://fake-bucket.s3.amazonaws.com/file1.txt",
      "https://fake-bucket.s3.amazonaws.com/file2.txt",
    ]);
  });
});
