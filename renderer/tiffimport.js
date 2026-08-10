export function tiffToPng(dataUrl) {
  const UTIF = window.UTIF;
  if (!UTIF) throw new Error("TIFF decoder is unavailable.");
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid TIFF data.");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const frames = UTIF.decode(bytes.buffer);
  if (!frames.length) throw new Error("The TIFF contains no image frames.");
  UTIF.decodeImage(bytes.buffer, frames[0]);
  const rgba = UTIF.toRGBA8(frames[0]);
  const canvas = document.createElement("canvas");
  canvas.width = frames[0].width;
  canvas.height = frames[0].height;
  const context = canvas.getContext("2d");
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), frameCount: frames.length };
}
