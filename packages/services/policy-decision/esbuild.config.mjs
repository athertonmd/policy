import { build } from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

const handlersDir = join(process.cwd(), 'src', 'handlers');
const handlers = readdirSync(handlersDir)
  .filter(f => f.endsWith('.ts') && !f.includes('.test.'))
  .map(f => join(handlersDir, f));

await build({
  entryPoints: handlers,
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'dist-bundled/handlers',
  format: 'cjs',
  sourcemap: true,
  external: [
    '@aws-sdk/*',  // Available in Lambda runtime
  ],
  minify: false,
});

console.log(`Bundled ${handlers.length} handlers to dist-bundled/`);
