import ytdl from '@distube/ytdl-core';
import { config } from '../../config.js';

export const handler = async (query) => {
  try {
    const url = query?.url || query?.link;
    
    if (!url) {
      return {
        status: 400,
        data: config.response('error', 'Parameter "url" is required')
      };
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return {
        status: 400,
        data: config.response('error', 'Invalid YouTube URL format')
      };
    }

    // Get video info
    const info = await ytdl.getInfo(url, { 
      requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } 
    });

    if (!info.videoDetails) {
      return {
        status: 404,
        data: config.response('error', 'Video not found or private')
      };
    }

    // Filter & sort formats
    const formats = info.formats
      .filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4')
      .sort((a, b) => (b.height || 0) - (a.height || 0))
      .slice(0, 5)
      .map(f => ({
        quality: `${f.height}p`,
        format: 'mp4',
        fps: f.fps,
        size: f.contentLength ? formatBytes(f.contentLength) : 'Unknown',
        url: f.url // Direct download URL (expires in ~6 hours)
      }));

    // Audio only option
    const audioFormat = info.formats.find(f => f.mimeType?.includes('audio/mp4'));
        const result = {
      title: info.videoDetails.title,
      channel: info.videoDetails.author.name,
      thumbnail: info.videoDetails.thumbnails.slice(-1)[0].url,
      duration: formatDuration(info.videoDetails.lengthSeconds),
      views: parseInt(info.videoDetails.viewCount).toLocaleString(),
      uploadDate: info.videoDetails.publishDate,
      description: info.videoDetails.shortDescription,
      formats: formats.length > 0 ? formats : null,
      audio: audioFormat ? {
        format: 'm4a',
        size: audioFormat.contentLength ? formatBytes(audioFormat.contentLength) : 'Unknown',
        url: audioFormat.url
      } : null
    };

    return {
      status: 200,
      data: config.response('success', 'Video info retrieved successfully', result)
    };

  } catch (error) {
    console.error('[YTDOWN ERROR]', error.message);
    
    // Handle common errors
    if (error.message.includes('Status code: 403')) {
      return {
        status: 403,
        data: config.response('error', 'Video is age-restricted or region-locked')
      };
    }
    if (error.message.includes('Status code: 410')) {
      return {
        status: 410,
        data: config.response('error', 'Video has been removed by the uploader')
      };
    }
    
    return {
      status: 500,
      data: config.response('error', `Failed to process video: ${error.message}`)
    };
  }
};

// Helper: Format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

// Helper: Format duration
const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds /
