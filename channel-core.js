import { Innertube, UniversalCache } from 'youtubei.js';

// YouTube's public web pages are attempted first. youtubei.js is a fallback.
// Neither method uses a YouTube Data API key; both depend on YouTube's public interfaces.
let ytPromise;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(str).join('');
  if (typeof v === 'object') {
    if (v.simpleText) return str(v.simpleText);
    if (v.runs) return v.runs.map(x => str(x.text)).join('');
    if (v.text) return str(v.text);
    if (v.content) return str(v.content);
  }
  return '';
}
function num(v) {
  const s = str(v).replace(/,/g, '');
  const m = s.match(/([\d.]+)\s*([KMBT])?/i);
  if (!m) return null;
  const k = {K:1e3,M:1e6,B:1e9,T:1e12}[(m[2]||'').toUpperCase()] || 1;
  const n = Math.round(Number(m[1])*k);
  return Number.isFinite(n) ? n : null;
}
function walk(o, fn, seen=new Set()) {
  if (!o || typeof o !== 'object' || seen.has(o)) return;
  seen.add(o); fn(o);
  for (const v of Object.values(o)) walk(v, fn, seen);
}
function deepText(o, keys) {
  let result = null;
  walk(o, x => { if (result !== null) return; for (const k of keys) if (x[k] != null) { const n=num(x[k]); if(n!==null){result=n;break;} } });
  return result;
}
function getInitialData(html) {
  const patterns = [
    /(?:var\s+)?ytInitialData\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/,
    /(?:var\s+)?ytInitialData\s*=\s*(\{[\s\S]*?\})\s*;/
  ];
  for (const re of patterns) {
    const m=html.match(re); if(m) { try{return JSON.parse(m[1]);}catch{} }
  }
  return null;
}
async function fetchPage(url) {
  const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'en-US,en;q=0.9','accept':'text/html,application/xhtml+xml'} , signal:AbortSignal.timeout(18000)});
  if(!r.ok) throw new Error(`YouTube returned HTTP ${r.status}`);
  const html=await r.text();
  const data=getInitialData(html);
  if(!data) throw new Error('YouTube did not provide readable public channel data.');
  return data;
}
function channelIdFrom(o) {
  let id=''; walk(o,x=>{ if(id)return; const b=x.browseEndpoint||x.browse_endpoint; const candidate=x.channelId||x.channel_id||b?.browseId||b?.browse_id; if(typeof candidate==='string' && candidate.startsWith('UC')) id=candidate; }); return id;
}
function renderers(data, key) { const out=[]; walk(data,x=>{if(x[key])out.push(x[key]);}); return out; }
function parseVideo(v) {
  const id=v.videoId||v.video_id; if(!id)return null;
  const thumbs=v.thumbnail?.thumbnails||v.thumbnail?.sources||[];
  return {id,title:str(v.title)||'Untitled video',views:num(v.viewCountText)||num(v.shortViewCountText)||num(v.view_count),likes:null,duration:str(v.lengthText),thumbnail:thumbs.at(-1)?.url||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};
}
function parsePage(data, fallbackHandle='') {
  const metadata=data.metadata?.channelMetadataRenderer||{};
  const header=data.header?.c4TabbedHeaderRenderer||data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel||{};
  const subs=str(header.subscriberCountText||header.subscriberCount||'') || str(metadata.subscriberCountText||'');
  const videoCount=str(header.videosCountText||header.videosCount||'');
  const videos=renderers(data,'videoRenderer').map(parseVideo).filter(Boolean);
  videos.sort((a,b)=>(b.views||0)-(a.views||0));
  const id=metadata.externalId||channelIdFrom(data);
  return {id,name:str(metadata.title||header.title||header.titleText)||'YouTube channel',handle:metadata.vanityChannelUrl?.match(/@[^/?]+/)?.[0]||fallbackHandle,subscribers:num(subs),subscribersText:subs||'Not publicly available',videoCount:num(videoCount)||deepText(data,['videoCount']),views:num(metadata.viewCount)||deepText(data,['viewCount']),videos};
}
function normalize(q) {
  const raw=String(q||'').trim(); if(!raw)throw new Error('Enter a channel name, @handle, channel URL, or channel ID.');
  const m=raw.match(/youtube\.com\/(?:@([^/?#]+)|channel\/(UC[\w-]+)|user\/([^/?#]+))/i);
  if(m?.[2])return {id:m[2]}; if(m?.[1])return {handle:'@'+m[1]}; if(m?.[3])return {query:m[3]};
  if(/^UC[\w-]{20,}$/.test(raw))return {id:raw}; if(raw.startsWith('@'))return {handle:raw}; return {query:raw};
}
async function htmlLookup(input) {
  let handle=input.handle||''; let id=input.id||''; let query=input.query||'';
  if(!id && !handle) {
    const search=await fetchPage('https://www.youtube.com/results?search_query='+encodeURIComponent(query));
    const candidates=renderers(search,'channelRenderer');
    const wanted=query.toLowerCase();
    const match=candidates.find(c=>str(c.title).toLowerCase()===wanted)||candidates[0];
    if(!match)throw new Error('No matching public channel found. Try its exact @handle or channel URL.');
    id=match.channelId||''; handle=str(match.title).startsWith('@')?str(match.title):'';
    if(!id) id=channelIdFrom(match);
  }
  let url=id?`https://www.youtube.com/channel/${id}/videos?view=0&sort=p`:`https://www.youtube.com/${handle}/videos?view=0&sort=p`;
  let data=await fetchPage(url);
  let parsed=parsePage(data,handle);
  if(!parsed.id && !id) { // Handle route may redirect or resolve differently; try its canonical page.
    data=await fetchPage(`https://www.youtube.com/${handle}`); parsed=parsePage(data,handle);
  }
  if(!parsed.id && id) parsed.id=id;
  if(!parsed.id)throw new Error('Could not resolve this channel. Try its full YouTube channel URL.');
  return parsed;
}
async function getYt() {
  if(!ytPromise) ytPromise=Innertube.create({cache:new UniversalCache(false),generate_session_locally:true,location:'IN',lang:'en'});
  return ytPromise;
}
async function libraryLookup(input) {
  const yt=await getYt(); let id=input.id; let match=null;
  if(!id){const term=input.handle||input.query;const result=await yt.search(term,{type:'channel'});const list=Array.from(result.channels||[]);if(!list.length)throw new Error('No matching channel found.');match=list[0];id=match.id||match.channel_id||match.navigation_endpoint?.browse_endpoint?.browse_id;}
  if(!id)throw new Error('Channel ID was not returned.');
  const ch=await yt.getChannel(id); const page=ch.page||ch; const h=ch.header||{}; const md=ch.metadata||{};
  const feed=await ch.getVideos(); let videos=Array.from(feed.videos||[]).map(v=>{const id=v.id||v.video_id;if(!id)return null;return{id,title:str(v.title)||'Untitled video',views:num(v.view_count?.text||v.view_count)||num(v.short_view_count),likes:null,duration:str(v.duration),thumbnail:v.thumbnails?.at(-1)?.url||''};}).filter(Boolean);
  videos.sort((a,b)=>(b.views||0)-(a.views||0));
  return {id,name:str(md.title||h.title)||'YouTube channel',handle:input.handle||'',subscribers:num(h.subscribers||md.subscriber_count),subscribersText:str(h.subscribers||md.subscriber_count)||'Not publicly available',videoCount:num(h.videos_count||md.video_count),views:deepText(page,['view_count','viewCount']),videos};
}
function estimate(video, subs) {
  const t=(video?.title||'').toLowerCase(); let category='general creator video',lo=15000,hi=90000;
  if(/animation|cartoon|nursery|kids|3d/.test(t)){category='animation / children’s content';lo=80000;hi=900000;}
  else if(/challenge|survive|last to|24 hour|prize|giveaway/.test(t)){category='large-scale challenge / production';lo=250000;hi=5000000;}
  else if(/music video|official video|lyrics/.test(t)){category='music video';lo=50000;hi=1200000;}
  else if(/travel|vlog|trip|adventure/.test(t)){category='travel / outdoor production';lo=25000;hi=350000;}
  else if(/podcast|interview|conversation/.test(t)){category='podcast / interview';lo=10000;hi=150000;}
  const dur=(video?.duration||'').split(':').reduce((a,x)=>a*60+(Number(x)||0),0)||480; const f=Math.min(3,Math.max(.65,dur/600)); const scale=subs>1e7?1.8:subs>1e6?1.35:subs>1e5?1.1:1;
  lo=Math.round(lo*f*scale);hi=Math.round(hi*f*scale);
  return {category,lowINR:lo,highINR:hi,midpointINR:Math.round((lo+hi)/2),confidence:'Low–medium',basis:'Indicative production-cost range inferred from public title, duration and channel scale; not actual creator spending.'};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=180, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});
  try {
    const input=normalize(req.query?.q);
    let channel, source='YouTube public pages'; let firstError='';
    try { channel=await htmlLookup(input); }
    catch(e){firstError=e?.message||'Public page lookup failed';}
    if(!channel?.id) {
      try { channel=await libraryLookup(input); source='YouTube public interface fallback'; }
      catch(e){throw new Error(`Could not load this channel. ${firstError} Fallback: ${e?.message||'unavailable'}`);}
    }
    const videos=(channel.videos||[]).filter(v=>v.id).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,8);
    const topVideo=videos[0]||null;
    return res.status(200).json({channel:{id:channel.id,name:channel.name,handle:channel.handle,subscribers:channel.subscribers,subscribersText:channel.subscribersText,videoCount:channel.videoCount,views:channel.views},popularVideos:videos,topVideo,investmentEstimate:estimate(topVideo,channel.subscribers||0),source,disclaimer:'Uses unofficial public YouTube interfaces, not the YouTube Data API. YouTube may block requests or hide/round statistics. Likes are shown only when publicly available. Investment is an estimate, not verified spending.'});
  } catch(e) {
    return res.status(502).json({error:e?.message||'Unable to retrieve this channel right now.',hint:'Check that the Vercel project includes api/channel.js and package.json, then redeploy. If YouTube blocks Vercel requests, retry later; no-key access cannot be guaranteed for every channel.'});
  }
}
