import axios from 'axios';
import { config } from '../../config.js';

export const handler = async (query) => {
  try {
    const url = query?.url || query?.link;
    
    if (!url) {
      return {
        status: 400,
         config.response('error', 'Parameter "url" is required')
      };
    }

    // Validate TikTok URL
    if (!url.includes('tiktok.com')) {
      return {
        status: 400,
         config.response('error', 'Invalid TikTok URL')
      };
    }

    // Use tikwm.com API (free, no watermark, no auth required)
    const apiRes = await axios.get('https://api.tikwm.com/api/', {
      params: { url: url, hd: 1 },
      headers: { 'Accept': 'application/json' },
      timeout: 15000
    });

    const data = apiRes.data;
    
    if (!data || data.code !== 0) {
      return {
        status: 400,
        data: config.response('error', data?.msg || 'Failed to fetch TikTok video')
      };
    }

    const video = data.data;
    
    const result = {
      title: video.title || 'No title',
      author: {
        username: video.author?.unique_id || video.author?.nickname || 'Unknown',
        nickname: video.author?.nickname || '',
        avatar: video.author?.avatar || ''
      },
      thumbnail: video.cover || video.dynamic_cover || '',
      duration: video.duration || 0,
      stats: {
        plays: video.play_count?.toLocaleString() || '0',
        likes: video.digg_count?.toLocaleString() || '0',
        comments: video.comment_count?.toLocaleString() || '0',
        shares: video.share_count?.toLocaleString() || '0'
      },
      music: {
        title: video.music?.title || '',
        author: video.music?.author || '',
        url: video.music?.play_url || ''
      },
      media: {
        // No Watermark (HD if available)
        nowm: video.play || '',
        // With Watermark (fallback)
        wm: video.wmplay || '',
        // Audio only
        audio: video.music?.play_url || '',
        // HD version (if available)
        hd: video.hdplay || null
      },
      created_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : null
    };

    return {
      status: 200,
       config.response('success', 'TikTok video retrieved successfully', result)
    };

  } catch (error) {
    console.error('[TTDOWN ERROR]', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        status: 504,
         config.response('error', 'Request timeout - TikTok API is slow, try again')
      };
    }
    
    return {
      status: 500,
       config.response('error', `Failed to process TikTok: ${error.message}`)
    };
  }
};