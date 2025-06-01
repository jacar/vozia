import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode (development, production)
  // Vite automatically loads .env files.
  // For Vercel, environment variables are set in the Vercel dashboard.

  return {
    // If your index.html is not in the root, adjust the root option.
    // For example, if it's in a 'src' folder:
    // root: 'src', 
    
    build: {
      // Output directory for the build (default is 'dist')
      outDir: '../dist', // Adjusted to be relative to project root if vite.config.js is in root.
                         // If your index.html is in the root, and vite.config.js is in the root,
                         // then outDir: 'dist' is usually correct.
                         // Let's assume index.html is in the root and this config is too.
      outDir: 'dist',
      
      rollupOptions: {
        input: {
          // Entry point of your application
          main: resolve(__dirname, 'index.html') 
        }
      },
      // Minify and other production optimizations are enabled by default for 'vite build'
    },
    
    // This is crucial for making environment variables available in your client-side code
    // as process.env.YOUR_VAR. Vercel will provide API_KEY during its build process.
    define: {
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
      // If you have other environment variables you need to expose:
      // 'process.env.ANOTHER_VAR': JSON.stringify(process.env.ANOTHER_VAR),
    },
    
    server: {
      // Development server options
      port: 3000, // Optional: specify dev server port
      open: true    // Optional: automatically open in browser
    }
  };
});
