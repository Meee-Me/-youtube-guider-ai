# YouTube Guider AI

A small web dashboard that shows a YouTube channel's subscribers, total videos, views, most popular videos, and a rough production-cost estimate.

Enter a channel `@handle`, URL, ID, or name to get started.

## How it works
- `index.html` is the dashboard.
- `netlify/functions/channel.mjs` is the serverless function behind `/api/channel`.
- `channel-core.js` calls the official YouTube Data API v3.

## Setup
1. Create a free YouTube Data API v3 key in Google Cloud.
2. In Netlify, add an environment variable named `YOUTUBE_API_KEY` with your key. Mark it as secret.
3. Deploy from this repository. Leave the build command empty and set the publish directory to `.`.

Never put the API key in the code.

## Limits
- The free YouTube quota is 10,000 units per day. Each search costs about 100 units.
- Subscriber counts are rounded by YouTube, and some channels hide them.
- The investment figure is a rough estimate based on the title, length and channel size. It is not the creator's real spending.

Not affiliated with or endorsed by YouTube.
