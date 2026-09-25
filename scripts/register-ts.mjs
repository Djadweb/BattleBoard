// Registers the extensionless-import resolver so the app's TypeScript modules
// can be exercised directly by node --experimental-strip-types.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-resolver.mjs', pathToFileURL(import.meta.filename));
