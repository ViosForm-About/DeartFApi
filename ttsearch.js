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

    // TikTok search via tikwm.com API (free, no auth)
    const apiUrl = `https://api.tikwm.com/api/feed/search`;
    
    const response = await axios.get(apiUrl, {
      params: {
        keywords: q,
        count: 20,
        cursor: 0
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000
    });

    const data = response.data;
    
    if (!data || data.code !== 0) {
      return {
        status: 400,
         config.response('error', data?.msg || 'Failed to fetch TikTok search results')
      };
    }

    const videos = data.data.videos || [];
    
    if (videos.length === 0) {
      return {
        status: 404,
         config.response('error', 'No videos found for this query')
      };
    }

    const results = videos.map(video => ({
      title: video.title || 'No title',      videoId: video.id,
      url: `https://tiktok.com/@${video.author?.unique_id || 'user'}/video/${video.id}`,
      thumbnail: video.cover || video.dynamic_cover || '',
      channel: {
        name: video.author?.nickname || video.author?.unique_id || 'Unknown',
        username: video.author?.unique_id || '',
        avatar: video.author?.avatar || '',
        verified: video.author?.verified || false
      },
      duration: video.duration || 0,
      stats: {
        plays: video.play_count || 0,
        likes: video.digg_count || 0,
        comments: video.comment_count || 0,
        shares: video.share_count || 0
      },
      music: {
        title: video.music?.title || '',
        author: video.music?.author || ''
      },
      media: {
        nowm: video.play || '',
        wm: video.wmplay || '',
        audio: video.music?.play_url || ''
      },
      created_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
      hashtags: video.hashtags?.map(h => h.title) || []
    }));

    return {
      status: 200,
       config.response('success', `Found ${results.length} results for "${q}"`, {
        query: q,
        total: results.length,
        results: results
      })
    };

  } catch (error) {
    console.error('[TTSEARCH ERROR]', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        status: 504,
         config.response('error', 'Request timeout - TikTok API is slow, try again')
      };
    }
    
    return {
      status: 500,       config.response('error', `Search failed: ${error.message}`)
    };
  }
};