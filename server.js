import express from 'express';
import cors from 'cors';
import { config, stats } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// ===== MIDDLEWARE =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// ===== REQUEST LOGGING =====
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '✅';
    console.log(`[${new Date().toISOString()}] ${status} [${requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// ===== RATE LIMITING (Simple) =====
const rateLimitMap = new Map();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });    return next();
  }
  
  const record = rateLimitMap.get(ip);
  if (now - record.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return next();
  }
  
  if (record.count >= RATE_LIMIT) {
    return res.status(429).json(config.response('error', 'Rate limit exceeded. Please try again later.', {
      retryAfter: Math.ceil((RATE_WINDOW - (now - record.start)) / 1000)
    }));
  }
  
  record.count++;
  next();
};

app.use(rateLimit);

// ===== TRACK REQUEST =====
const trackRequest = (success = true) => {
  stats.totalRequests++;
  if (success) stats.success++;
  else stats.failed++;
};

// ===== IMPORT API HANDLERS =====
import { handler as ytsearch } from './restapi/search/ytsearch.js';
import { handler as ttsearch } from './restapi/search/ttsearch.js';
import { handler as ytdown } from './restapi/downloader/ytdown.js';
import { handler as ttdown } from './restapi/downloader/ttdown.js';

// ===== API ROUTES - SEARCH =====
app.get('/search/ytsearch.json', async (req, res) => {
  try {
    const result = await ytsearch(req.query);
    trackRequest(result.status === 200);
    res.status(result.status).json(result.data);
  } catch (e) {
    trackRequest(false);
    console.error('[ERROR /search/ytsearch.json]', e.message);
    res.status(500).json(config.response('error', 'Internal server error'));
  }
});

app.get('/search/ttsearch.json', async (req, res) => {
  try {
    const result = await ttsearch(req.query);    trackRequest(result.status === 200);
    res.status(result.status).json(result.data);
  } catch (e) {
    trackRequest(false);
    console.error('[ERROR /search/ttsearch.json]', e.message);
    res.status(500).json(config.response('error', 'Internal server error'));
  }
});

// ===== API ROUTES - DOWNLOADER =====
app.get('/downloader/ytdown.json', async (req, res) => {
  try {
    const result = await ytdown(req.query);
    trackRequest(result.status === 200);
    res.status(result.status).json(result.data);
  } catch (e) {
    trackRequest(false);
    console.error('[ERROR /downloader/ytdown.json]', e.message);
    res.status(500).json(config.response('error', 'Internal server error'));
  }
});

app.get('/downloader/ttdown.json', async (req, res) => {
  try {
    const result = await ttdown(req.query);
    trackRequest(result.status === 200);
    res.status(result.status).json(result.data);
  } catch (e) {
    trackRequest(false);
    console.error('[ERROR /downloader/ttdown.json]', e.message);
    res.status(500).json(config.response('error', 'Internal server error'));
  }
});

// ===== SYSTEM ENDPOINTS =====
app.get('/api/stats', (req, res) => {
  res.json({
    ...stats,
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime()),
    status: 'online',
    version: config.version,
    nodeVersion: process.version,
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/docs', (req, res) => {
  res.json({    name: config.appName,
    version: config.version,
    description: 'Real YouTube & TikTok Search + Downloader API',
    creator: 'DeartF',
    endpoints: {
      search: {
        youtube: {
          method: 'GET',
          path: '/search/ytsearch.json',
          params: { q: 'string (required) - Search query' },
          example: '/search/ytsearch.json?q=lagu+indonesia'
        },
        tiktok: {
          method: 'GET',
          path: '/search/ttsearch.json',
          params: { q: 'string (required) - Search query' },
          example: '/search/ttsearch.json?q=tutorial+masak'
        }
      },
      downloader: {
        youtube: {
          method: 'GET',
          path: '/downloader/ytdown.json',
          params: { url: 'string (required) - YouTube video URL' },
          example: '/downloader/ytdown.json?url=https://youtube.com/watch?v=xxx'
        },
        tiktok: {
          method: 'GET',
          path: '/downloader/ttdown.json',
          params: { url: 'string (required) - TikTok video URL' },
          example: '/downloader/ttdown.json?url=https://tiktok.com/@user/video/xxx'
        }
      }
    },
    response_format: {
      status: 'success | error',
      message: 'string - Response message',
      creator: 'string - API creator',
      timestamp: 'string - ISO8601 timestamp',
      data: 'object - Response data'
    },
    rate_limit: {
      limit: RATE_LIMIT,
      window: `${RATE_WINDOW/1000} seconds`,
      header: 'X-RateLimit-Remaining'
    }
  });
});

app.get('/ping', (req, res) => {  res.json(config.response('success', 'pong', {
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  }));
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
  res.status(200).json(health);
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json(config.response('error', 'Endpoint not found', {
    path: req.path,
    method: req.method,
    available_endpoints: [
      '/search/ytsearch.json',
      '/search/ttsearch.json',
      '/downloader/ytdown.json',
      '/downloader/ttdown.json',
      '/api/stats',
      '/api/docs',
      '/ping',
      '/health'
    ],
    hint: 'Check /api/docs for full documentation'
  }));
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err.stack);
  trackRequest(false);
  res.status(500).json(config.response('error', 'Internal server error', {
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  }));
});

// ===== HELPER FUNCTIONS =====
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// ===== START SERVER =====
const PORT = config.port || process.env.PORT || 3000;

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🚀 ${config.appName} v${config.version}`);
    console.log('='.repeat(50));
    console.log(`📊 Dashboard  : http://localhost:${PORT}`);
    console.log(`📚 API Docs   : http://localhost:${PORT}/api/docs`);
    console.log(`💓 Health     : http://localhost:${PORT}/health`);
    console.log(`🔍 YT Search  : http://localhost:${PORT}/search/ytsearch.json?q=test`);
    console.log(`⬇️  YT Download : http://localhost:${PORT}/downloader/ytdown.json?url=...`);
    console.log('='.repeat(50));
    console.log('✅ Server ready for private bot integration!\n');
  });
}

// ===== EXPORT FOR VERCEL =====
export default app;