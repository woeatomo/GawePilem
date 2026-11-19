import { startRenderLocal } from './server';

const port = Number(process.env.RENDER_LOCAL_PORT ?? 8790);
startRenderLocal({ port, dir: process.env.RENDER_LOCAL_DIR ?? './.render-local', ...(process.env.RENDER_LOCAL_KEY ? { apiKey: process.env.RENDER_LOCAL_KEY } : {}) });
console.log(JSON.stringify({ msg: 'emulator render (API Rendi) siap', port }));
