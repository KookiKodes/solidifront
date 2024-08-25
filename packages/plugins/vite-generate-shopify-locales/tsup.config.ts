import path from 'node:path';
import fs from 'node:fs/promises';
import { defineConfig } from 'tsup';

const outDir = 'dist';

const commonConfig = {
  minify: false,
  bundle: false,
  splitting: true,
  treeshake: true,
  sourcemap: true,
};

export default defineConfig([
  {
    ...commonConfig,
    format: 'esm',
    entry: ['src/**/*.ts', '!src/locales'],
    outDir: `${outDir}/esm`,
    dts: true,
    async onSuccess() {
      const fileDir = path.join('locales', 'index.d.ts');
      const localeFile = path.resolve('.', 'src', fileDir);
      await fs.mkdir(path.resolve('./dist/locales'), { recursive: true });
      await fs.copyFile(localeFile, path.resolve('.', outDir, fileDir));
      // const [dts] = generateDtsBundle([
      //   {
      //     filePath: './src/index.ts',
      //     libraries: {
      //       inlinedLibraries: ['@shopify/graphql-codegen', 'type-fest'],
      //     },
      //     output: { noBanner: true },
      //   },
      // ]);
      // await fs.writeFile('dist/esm/index.d.ts', dts);
    },
  },
  {
    ...commonConfig,
    format: 'cjs',
    dts: false,
    entry: ['src/**/*.ts', '!src/locales/**/*.ts'],
    outDir: `${outDir}/cjs`,
    plugins: [
      {
        name: 'replace-require-extension',
        async buildEnd({ writtenFiles }) {
          await Promise.all(
            writtenFiles
              .filter(({ name }) => name.endsWith('.cjs'))
              .map(async ({ name }) => {
                const filepath = path.resolve('.', name);
                const contents = await fs.readFile(filepath, 'utf8');

                await fs.writeFile(
                  filepath,
                  contents.replace(/\.js'\);/g, ".cjs');"),
                );
              }),
          );
        },
      },
    ],
  },
]);
