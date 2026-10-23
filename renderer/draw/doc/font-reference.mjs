/** Portable, version-pinned Google font reference. Never permits local or arbitrary remote files. */
export function validGoogleReference(ref) {
  return ref&&typeof ref==='object'&&typeof ref.family==='string'&&ref.family.length>0&&ref.family.length<300&&
    typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256)&&typeof ref.url==='string'&&
    /^https:\/\/fonts\.gstatic\.com\/s\/[\w/.,%-]+\.(ttf|otf)$/.test(ref.url)&&
    typeof ref.license==='string'&&ref.license.length>100&&ref.license.length<100000;
}
export function validFontAxes(axes) {
  return axes&&typeof axes==='object'&&!Array.isArray(axes)&&Object.keys(axes).length<=32&&
    Object.entries(axes).every(([tag,value])=>/^[A-Za-z0-9]{4}$/.test(tag)&&Number.isFinite(value)&&Math.abs(value)<=1000000);
}
