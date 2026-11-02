import path from 'node:path';

import { createApp } from './app.js';

// The factory's container contract: listen on 0.0.0.0:$PORT, keep data under /data.
const dataDir = process.env.DATA_DIR || '/data';
const port = Number(process.env.PORT) || 8080;
const { app } = createApp({ dbPath: path.join(dataDir, 'app.db') });
app.listen(port, '0.0.0.0', () => console.log(`listening on http://0.0.0.0:${port}`));
