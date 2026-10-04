import { mkdir, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class RssPollLock {
  constructor(private readonly path: string) {}

  async withLock<T>(run: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      await mkdir(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`RSS poll already locked: ${this.path}`);
      throw error;
    }
    try {
      return await run();
    } finally {
      await rmdir(this.path);
    }
  }
}
