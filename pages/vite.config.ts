import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/move-coach/',publicDir:'../public',plugins:[react()],build:{outDir:'../docs',emptyOutDir:true}});
