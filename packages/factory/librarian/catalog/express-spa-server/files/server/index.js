import path from 'node:path';
import { createApp } from './app.js';

const dataDir = process.env.DATA_DIR || '/data';
const port = Number(process.env.PORT) || 8080;
const { app } = createApp({ dbPath: path.join(dataDir, 'wheels2go.db') });
app.listen(port, '0.0.0.0', () => console.log(`Wheels2Go listening on http://0.0.0.0:${port}`));
