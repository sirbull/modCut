/** Some fonts omit English names for variable instances. Keep their axes usable. */
export function variableMetadata(font) {
  const axes={},instances={};
  for(const axis of font.fvar?.axis??[])axes[axis.axisTag.trim()]={name:axis.name?.en??axis.axisTag.trim(),min:axis.minValue,default:axis.defaultValue,max:axis.maxValue};
  for(const instance of font.fvar?.instance??[]) {
    const settings=Object.fromEntries((font.fvar.axis??[]).map((axis,i)=>[axis.axisTag.trim(),instance.coord[i]]));
    const name=instance.name?.en??Object.entries(settings).map(([tag,v])=>`${tag} ${v}`).join(' · ');
    instances[name]=settings;
  }
  return {axes,instances};
}
