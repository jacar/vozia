import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  // Log the API_KEY as seen by Vite during the build process
  // This log will appear in Vercel's build logs
  console.log(`[vite.config.js] Build command: ${command}, Mode: ${mode}`);
  const apiKeyFromEnv = process.env.API_KEY;
  console.log(`[vite.config.js] API_KEY from build environment: "${apiKeyFromEnv}"`);

  if (command === 'build' && !apiKeyFromEnv) {
    console.warn(
      '[vite.config.js] WARNING: API_KEY is not defined or empty in the build environment!'
    );
    // You could throw an error here to fail the build if the API key is absolutely mandatory
    // throw new Error("API_KEY is not defined for production build. Please set it in Vercel environment variables.");
  }

  return {
    build: {
      // Output directory for the build (default is 'dist')
      outDir: '
