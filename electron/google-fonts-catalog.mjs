/** Public Google Fonts metadata. A bundled snapshot keeps browsing independent of the network. */
import { createHash } from 'node:crypto';
export const GOOGLE_METADATA_URL='https://fonts.google.com/metadata/fonts';
export const googleJSON=buffer=>JSON.parse(buffer.toString().replace(/^\)\]\}'\s*/,''));
export const fontDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildGoogleCatalog(metadata) {
  if(!Array.isArray(metadata.familyMetadataList)||metadata.familyMetadataList.length<1000)throw new Error('Google Fonts returned an incomplete catalog.');
  const families=metadata.familyMetadataList.map(f=>({family:f.family,category:f.category,subsets:f.subsets,variants:Object.keys(f.fonts),axes:f.axes,color:f.colorCapabilities??[]})).sort((a,b)=>a.family.localeCompare(b.family));
  return {version:1,revision:fontDigest(JSON.stringify(families)),updatedAt:new Date().toISOString(),families};
}

export async function fetchFontResource(url,{fetcher=fetch,maxBytes=12*1024*1024}={}) {
  const u=new URL(url);
  if(u.protocol!=='https:'||!['fonts.google.com','fonts.gstatic.com'].includes(u.hostname)||u.username||u.password||u.port)throw new Error('Unexpected font download host.');
  const response=await fetcher(u.href,{signal:AbortSignal.timeout(45000),redirect:'error',headers:{'User-Agent':'modCut Google Fonts catalog','Accept':'application/json, text/plain, */*'}});
  if(!response.ok)throw new Error(`Google Fonts download failed (${response.status}). Check your connection and try again.`);
  if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('Font download is too large.');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw new Error('Font download is too large.');chunks.push(chunk);}
  return Buffer.concat(chunks);
}

export async function downloadGoogleCatalog(options={}) {
  return buildGoogleCatalog(googleJSON(await fetchFontResource(GOOGLE_METADATA_URL,options)));
}
