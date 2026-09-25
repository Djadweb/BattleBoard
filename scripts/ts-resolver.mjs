// Resolver hook so `node --experimental-strip-types` can run the app's
// extensionless TypeScript imports (Next/webpack resolves these; bare Node does not).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js']) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true, format: 'module-typescript' };
      }
    }
  }
  return nextResolve(specifier, context);
}
