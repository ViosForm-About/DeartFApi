import axios from 'axios';
import { config } from '../../config.js';

export const handler = async (query) => {
  try {
    const q = query?.q || query?.query;
    
    if (!q) {
      return {
        status: 400,
         config.response('error', 'Parameter "q" is required')
      };
    }

    // YouTube search via scraping (no API key needed)
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });

    // Extract ytInitialData from HTML
    const html = response.data;
    const initialDataMatch = html.match(/ytInitialData\s*=\s*({.+?})\s*;\s*var\s+meta/);
    
    if (!initialDataMatch) {
      return {
        status: 500,
         config.response('error', 'Failed to parse YouTube search results')
      };
    }

    const initialData = JSON.parse(initialDataMatch[1]);
    const contents = initialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    if (!contents) {
      return {
        status: 404,
         config.response('error', 'No search results found')
      };
    }

    // Parse video results
    const results = [];
        for (const section of contents) {
      const items = section.itemSectionRenderer?.contents || [];
      
      for (const item of items) {
        const video = item.videoRenderer;
        const short = item.reelItemRenderer; // Shorts
        const entry = video || short;
        
        if (!entry) continue;
        
        // Skip ads & non-video content
        if (entry.badges?.some(b => b.metadataBadgeRenderer?.label === 'Ad')) continue;
        
        const videoId = video?.videoId || short?.videoId;
        if (!videoId) continue;
        
        const title = entry.title?.runs?.[0]?.text || entry.headline?.runs?.[0]?.text || 'No title';
        const channel = entry.ownerText?.runs?.[0]?.text || entry.shortBylineText?.runs?.[0]?.text || 'Unknown';
        const channelUrl = entry.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
        const thumbnail = entry.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
        
        // Duration & views
        const lengthText = entry.lengthText?.simpleText || entry.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText || '';
        const viewCount = entry.viewCountText?.simpleText?.replace(/\D/g, '') || '0';
        const publishedTime = entry.publishedTimeText?.simpleText || '';
        
        results.push({
          title: title.trim(),
          videoId: videoId,
          url: `https://youtube.com/watch?v=${videoId}`,
          thumbnail: thumbnail,
          channel: {
            name: channel.trim(),
            url: channelUrl ? `https://youtube.com${channelUrl}` : ''
          },
          duration: lengthText || 'N/A',
          views: parseInt(viewCount) || 0,
          viewsText: entry.viewCountText?.simpleText || '0 views',
          published: publishedTime,
          type: short ? 'short' : 'video'
        });
        
        // Limit to 20 results
        if (results.length >= 20) break;
      }
      if (results.length >= 20) break;
    }

    if (results.length === 0) {
      return {        status: 404,
         config.response('error', 'No videos found for this query')
      };
    }

    return {
      status: 200,
       config.response('success', `Found ${results.length} results for "${q}"`, {
        query: q,
        total: results.length,
        results: results
      })
    };

  } catch (error) {
    console.error('[YTSEARCH ERROR]', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        status: 504,
         config.response('error', 'Request timeout - YouTube is slow, try again')
      };
    }
    
    if (error.response?.status === 429) {
      return {
        status: 429,
         config.response('error', 'Rate limited by YouTube. Please wait before retrying')
      };
    }
    
    return {
      status: 500,
       config.response('error', `Search failed: ${error.message}`)
    };
  }
};
