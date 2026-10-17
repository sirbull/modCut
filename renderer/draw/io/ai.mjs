/**
 * Illustrator export (D3.7): a PDF-compatible .ai file is a PDF with Illustrator's XMP fields, the art box
 * on every page and the Draw document attached, as Illustrator itself writes when "Create PDF Compatible
 * File" is on. Illustrator opens it as artwork (live effects and type arrive expanded); modCut reopens the
 * attached document with everything editable. Pure.
 */
export const AI_OPTIONS = Object.freeze({ version: '1.6', layers: true, preserveEditing: true, thumbnails: true, compressArt: true,
  downsample: 'none', ppi: 300, above: 450, imageCompression: 'zip', jpegQuality: 'maximum', marks: {}, bleed: null });

const xml = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
/** XMP packet that marks the file as an Illustrator document; sizes in millimetres. */
export function aiMetadata({ title = 'Untitled', pages = [], now = new Date(), transparency = false } = {}) {
  const width = Math.max(0, ...pages.map((p) => p.width)), height = Math.max(0, ...pages.map((p) => p.height)), n = (v) => String(Number(v.toFixed(4)));
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="modCut">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:illustrator="http://ns.adobe.com/illustrator/1.0/"
    xmlns:xmpTPg="http://ns.adobe.com/xap/1.0/t/pg/"
    xmlns:stDim="http://ns.adobe.com/xap/1.0/sType/Dimensions#">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(title)}</rdf:li></rdf:Alt></dc:title>
   <xmp:CreatorTool>modCut Draw</xmp:CreatorTool>
   <xmp:CreateDate>${iso(now)}</xmp:CreateDate>
   <xmp:ModifyDate>${iso(now)}</xmp:ModifyDate>
   <xmp:MetadataDate>${iso(now)}</xmp:MetadataDate>
   <pdf:Producer>modCut</pdf:Producer>
   <illustrator:Type>Document</illustrator:Type>
   <illustrator:StartupProfile>Print</illustrator:StartupProfile>
   <xmpTPg:NPages>${pages.length}</xmpTPg:NPages>
   <xmpTPg:HasVisibleTransparency>${transparency ? 'True' : 'False'}</xmpTPg:HasVisibleTransparency>
   <xmpTPg:HasVisibleOverprint>False</xmpTPg:HasVisibleOverprint>
   <xmpTPg:MaxPageSize rdf:parseType="Resource">
    <stDim:w>${n(width)}</stDim:w>
    <stDim:h>${n(height)}</stDim:h>
    <stDim:unit>Millimeters</stDim:unit>
   </xmpTPg:MaxPageSize>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
/** True when anything in the artwork models is see-through or blended, for HasVisibleTransparency. */
export function hasTransparency(models) {
  const walk = (items) => items.some((item) => item.opacity < 1 || (item.blend && item.blend !== 'normal') || (item.type === 'group' && walk(item.children)));
  return models.some((m) => m.layers.some((layer) => walk(layer.items)));
}
