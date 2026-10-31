# YouTube Guider AI — Netlify build

## Deploy
1. Upload this complete ZIP to a GitHub repository (extract it first; do not deploy only `index.html`).
2. In Netlify choose **Add new project → Import an existing project** and connect the repository.
3. Build settings: leave build command empty; publish directory `.`. `netlify.toml` configures the Functions directory and `/api/channel` rewrite.
4. Deploy, then open the site's `netlify.app` URL and search for `@MrBeast` or another public channel.

## Included
- `index.html`: dashboard UI.
- `channel-core.js`: shared channel lookup logic.
- `netlify/functions/channel.mjs`: Netlify Function adapter.
- `netlify.toml`: routes `/api/channel` to the function.

## Important limitations
The backend uses unofficial public YouTube interfaces, not the official YouTube Data API. YouTube may change or block these interfaces; therefore no-key access to every channel is not guaranteed. Subscriber/view/video counts and likes may be hidden or rounded. The investment estimate is a heuristic range, not actual creator spending or a verified AI audit. Netlify's function execution limits can also interrupt slow YouTube responses, depending on the plan.
