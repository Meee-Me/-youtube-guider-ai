// YouTube Guider AI - channel lookup using the official YouTube Data API v3.
// The API key is read from the Netlify environment variable YOUTUBE_API_KEY (never put the key in code).
const API = 'https://www.googleapis.com/youtube/v3';

async function yt(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('Server is missing the YOUTUBE_API_KEY setting.');
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error('Could not reach YouTube. Please try again.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = data?.error?.errors?.[0]?.reason || '';
    if (reason === 'quotaExceeded') throw new Error('Daily YouTube API limit reached. Try again tomorrow.');
    if (reason === 'keyInvalid' || reason === 'API_KEY_INVALID') throw new Error('The YouTube API key is invalid.');
    throw new Error(data?.error?.message || `YouTube returned HTTP ${r.status}`);
  }
  return data;
}

function normalize(q) {
  const raw = String(q || '').trim();
  if (!raw) throw new Error('Enter a channel name, @handle, channel URL, or channel ID.');
  const m = raw.match(/youtube\.com\/(?:@([^/?#]+)|channel\/(UC[\w-]+)|user\/([^/?#]+))/i);
  if (m?.[2]) return { id: m[2] };
  if (m?.[1]) return { handle: '@' + decodeURIComponent(m[1]) };
  if (m?.[3]) return { query: decodeURIComponent(m[3]) };
  if (/^UC[\w-]{20,}$/.test(raw)) return { id: raw };
  if (raw.startsWith('@')) return { handle: raw };
  return { query: raw };
}

function isoToClock(iso) {
  const m = String(iso || '').match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';
  const h = Number(m[1] || 0), mi = Number(m[2] || 0), s = Number(m[3] || 0);
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function findChannel(input) {
  const part = 'snippet,statistics';
  let res;
  if (input.id) {
    res = await yt('/channels', { part, id: input.id });
  } else if (input.handle) {
    res = await yt('/channels', { part, forHandle: input.handle });
  } else {
    const found = await yt('/search', { part: 'snippet', type: 'channel', q: input.query, maxResults: '1' });
    const id = found.items?.[0]?.snippet?.channelId || found.items?.[0]?.id?.channelId;
    if (!id) throw new Error('No matching public channel found. Try its exact @handle or channel URL.');
    res = await yt('/channels', { part, id });
  }
  const ch = res.items?.[0];
  if (!ch) throw new Error('No matching public channel found. Try its exact @handle or channel URL.');
  return ch;
}

async function popularVideos(channelId) {
  const found = await yt('/search', {
    part: 'id', channelId, type: 'video', order: 'viewCount', maxResults: '8'
  });
  const ids = (found.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vids = await yt('/videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
  return (vids.items || [])
    .map(v => ({
      id: v.id,
      title: v.snippet?.title || 'Untitled video',
      views: toNum(v.statistics?.viewCount),
      likes: toNum(v.statistics?.likeCount),
      duration: isoToClock(v.contentDetails?.duration),
      thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
    }))
    .sort((a, b) => (b.views || 0) - (a.views || 0));
}

function estimate(video, subs) {
  const t = (video?.title || '').toLowerCase();
  let category = 'general creator video', lo = 15000, hi = 90000;
  if (/animation|cartoon|nursery|kids|3d/.test(t)) { category = 'animation / children’s content'; lo = 80000; hi = 900000; }
  else if (/challenge|survive|last to|24 hour|prize|giveaway/.test(t)) { category = 'large-scale challenge / production'; lo = 250000; hi = 5000000; }
  else if (/music video|official video|lyrics/.test(t)) { category = 'music video'; lo = 50000; hi = 1200000; }
  else if (/travel|vlog|trip|adventure/.test(t)) { category = 'travel / outdoor production'; lo = 25000; hi = 350000; }
  else if (/podcast|interview|conversation/.test(t)) { category = 'podcast / interview'; lo = 10000; hi = 150000; }
  const dur = (video?.duration || '').split(':').reduce((a, x) => a * 60 + (Number(x) || 0), 0) || 480;
  const f = Math.min(3, Math.max(0.65, dur / 600));
  const scale = subs > 1e7 ? 1.8 : subs > 1e6 ? 1.35 : subs > 1e5 ? 1.1 : 1;
  lo = Math.round(lo * f * scale); hi = Math.round(hi * f * scale);
  return {
    category, lowINR: lo, highINR: hi, midpointINR: Math.round((lo + hi) / 2),
    confidence: 'Low–medium',
    basis: 'Indicative production-cost range inferred from public title, duration and channel scale; not actual creator spending.'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  try {
    const input = normalize(req.query?.q);
    const ch = await findChannel(input);
    const stats = ch.statistics || {};
    const hidden = stats.hiddenSubscriberCount === true || stats.hiddenSubscriberCount === 'true';
    const subscribers = hidden ? null : toNum(stats.subscriberCount);
    const videos = await popularVideos(ch.id);
    const topVideo = videos[0] || null;
    return res.status(200).json({
      channel: {
        id: ch.id,
        name: ch.snippet?.title || 'YouTube channel',
        handle: ch.snippet?.customUrl || input.handle || '',
        subscribers,
        subscribersText: hidden ? 'Hidden by the creator' : (subscribers != null ? String(subscribers) : 'Not publicly available'),
        videoCount: toNum(stats.videoCount),
        views: toNum(stats.viewCount)
      },
      popularVideos: videos,
      topVideo,
      investmentEstimate: estimate(topVideo, subscribers || 0),
      source: 'YouTube Data API v3',
      disclaimer: 'Data from the official YouTube Data API. Subscriber counts above 1,000 are rounded by YouTube. Investment is an estimate, not verified spending.'
    });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Unable to retrieve this channel right now.' });
  }
}
