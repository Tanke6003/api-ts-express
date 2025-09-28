// src/infrastructure/plugins/nativeFileStorage.plugin.ts
import { IFileStorage } from "../../domain/interfaces/infrastructure/plugins/fileStorage.interface";
import path from "path";
import fs from "fs";

export class NativeFileStoragePlugin implements IFileStorage {
    private readonly uploadDirectory: string;

    constructor(uploadDirectory?: string) {
        this.uploadDirectory =
            uploadDirectory ?? path.join(__dirname, "../../uploads");
        console.log(this.uploadDirectory)

        if (!fs.existsSync(this.uploadDirectory)) {
            fs.mkdirSync(this.uploadDirectory, { recursive: true });
        }
    }

    async single(file: { buffer: Buffer; originalname: string }): Promise<string> {
        const filename = `${file.originalname}`;
        const filepath = path.join(this.uploadDirectory, filename);
        await fs.promises.writeFile(filepath, file.buffer);
        return filepath;
    }

    async array(
        files: { buffer: Buffer; originalname: string }[]
    ): Promise<string[]> {
        const results: string[] = [];
        for (const f of files) {
            results.push(await this.single(f));
        }
        return results;
    }
}
