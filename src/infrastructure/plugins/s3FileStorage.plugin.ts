import { IFileStorage } from "../../domain/interfaces/infrastructure/plugins/fileStorage.interface";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export class S3FileStoragePlugin implements IFileStorage {
  private s3: S3Client;
  private bucket: string;

  /**
   * @param bucket Nombre del bucket
   * @param region Región del bucket
   * @param accessKeyId Access Key
   * @param secretAccessKey Secret Key
   * @param endpoint Opcional: endpoint custom para S3 local (MinIO u otro)
   */
  constructor(
    bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    endpoint?: string
  ) {
    this.bucket = bucket;
    this.s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint, // necesario para MinIO
      credentials: { accessKeyId, secretAccessKey }
    });
  }

  /**
   * Guarda un solo archivo y retorna la URL pública
   */
  async single(file: { buffer: Buffer; originalname: string }): Promise<string> {
    const key = file.originalname;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ACL: "public-read" // o privado según necesidad
      })
    );

    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  /**
   * Guarda varios archivos y retorna un arreglo de URLs públicas
   */
  async array(files: { buffer: Buffer; originalname: string }[]): Promise<string[]> {
    const results: string[] = [];
    for (const f of files) {
      results.push(await this.single(f));
    }
    return results;
  }
}
