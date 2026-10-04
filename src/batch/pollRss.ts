import { loadRssConfig } from '../config/env.js';
import { createRssService } from '../services/rss/createRssService.js';

createRssService(loadRssConfig()).poll()
  .then((posted) => console.log(JSON.stringify({ posted })))
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
