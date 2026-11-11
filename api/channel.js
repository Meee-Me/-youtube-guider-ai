// /api/channel on Vercel. Vercel calls this with (req, res) in the same style
// the shared code expects, so it is used as it is. The key comes from the
// Vercel environment variable YOUTUBE_API_KEY.
import coreHandler from '../channel-core.js';

export default async function handler(req, res) {
  try {
    await coreHandler(req, res);
  } catch (error) {
    res.status(502).json({ error: (error && error.message) || 'Channel lookup failed.' });
  }
}
