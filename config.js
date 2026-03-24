// Konfigurasi Global DeartFApi
export const config = {
  appName: "DeartFApi",
  version: "1.0.0",
  port: process.env.PORT || 3000,
  
  // Statistik (in-memory, reset saat restart)
  stats: {
    totalRequests: 0,
    success: 0,
    failed: 0,
    endpoints: 4 // ttdown, ytdown, ytsearch, ttsearch
  },
  
  // Base URL (auto detect di production)
  getBaseUrl: (req) => {
    const host = req.get('host');
    const proto = req.protocol;
    return `${proto}://${host}`;
  },
  
  // Helper response
  response: (status, message, data = null) => ({
    status,
    message,
    creator: "DeartF",
    timestamp: new Date().toISOString(),
    data
  })
};

// Export stats mutable object
export const stats = config.stats;