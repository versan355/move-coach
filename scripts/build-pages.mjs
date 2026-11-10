import {build} from 'vite';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await build({configFile:fileURLToPath(new URL('../pages/vite.config.ts',import.meta.url))});
await writeFile(new URL('../docs/.nojekyll',import.meta.url),'');
