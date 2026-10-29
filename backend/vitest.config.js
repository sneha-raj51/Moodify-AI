import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  cacheDir: path.resolve('E:/Moodify AI/scratch/vitest-cache'),
  test: {
    isolate: false,
    fileParallelism: false,
  },
});
