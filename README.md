# YouTube Guider AI

A small web dashboard that shows a YouTube channel's subscribers, total videos, views, most popular videos, and a rough production-cost estimate.

Enter a channel `@handle`, URL, ID, or name to get started.

## How it works
- `index.html` is the dashboard.
- `api/channel.js` (Vercel) and `netlify/functions/channel.mjs` (Netlify) serve `/api/channel`.
- `channel-core.js` calls the official YouTube Data API v3.

## Deluxe account
The page loads `deluxe.js` from [Deluxe Main](https://deluxe-main.vercel.app). Tap **Sign in with Deluxe Main** (top bar) and the channels you look at are saved to your Deluxe account (under the `youtube` website in Deluxe Main) and shown on the search screen on any device. Accounts are only made on Deluxe Main.

## Setup on Vercel
1. Create a free YouTube Data API v3 key in Google Cloud (APIs & Services, Library, YouTube Data API v3, Enable; then Credentials, Create credentials, API key).
2. In Vercel: the YouTube Guider project, Settings, Environment Variables. Add `YOUTUBE_API_KEY` with your key (tick Production, mark it Sensitive), Save.
3. Deployments, the top one, ⋯, Redeploy. `api/channel.js` serves `/api/channel` there.

## Setup on Netlify
1. Create a free YouTube Data API v3 key in Google Cloud.
2. In Netlify, add an environment variable named `YOUTUBE_API_KEY` with your key. Mark it as secret.
3. Deploy from this repository. Leave the build command empty and set the publish directory to `.`.

Never put the API key in the code.

## Limits
- The free YouTube quota is 10,000 units per day. Each search costs about 100 units.
- Subscriber counts are rounded by YouTube, and some channels hide them.
- The investment figure is a rough estimate based on the title, length and channel size. It is not the creator's real spending.

Not affiliated with or endorsed by YouTube.
