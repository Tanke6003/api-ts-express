export interface IFileStorage {
  // Guarda un archivo y retorna la ruta o URL
  single(file: { buffer: Buffer; originalname: string }): Promise<string>;

  // Guarda varios archivos y retorna un arreglo de rutas o URLs
  array(files: { buffer: Buffer; originalname: string }[]): Promise<string[]>;
}
