import { defineConfig, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import 'dotenv/config';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    {
      name: 'netlify-v2-local-proxy',
      configureServer(server: ViteDevServer) {
        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (!req.url?.startsWith('/api/')) return next();
          try {
            const endpoint = req.url.split('?')[0].replace('/api/', '');
            const functionPath = path.resolve(__dirname, `./netlify/functions/${endpoint}.ts`);
            
            if (!fs.existsSync(functionPath)) {
              res.statusCode = 404;
              return res.end('Function not found locally');
            }

            const module = await server.ssrLoadModule(functionPath);
            const handler = module.default;

            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const chunks: any[] = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = chunks.length ? Buffer.concat(chunks) : undefined;

            const webReq = new Request(url.href, {
              method: req.method,
              headers: req.headers as any,
              body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
              duplex: 'half'
            } as any);

            const webRes: Response = await handler(webReq);
            res.statusCode = webRes.status;
            webRes.headers.forEach((val, key) => res.setHeader(key, val));
            
            const arrayBuf = await webRes.arrayBuffer();
            res.end(Buffer.from(arrayBuf));
          } catch (err: any) {
            console.error('Local Netlify Proxy Error:', err);
            res.statusCode = 500;
            res.end(err.message);
          }
        });
      }
    }
  ].filter(Boolean) as any,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
