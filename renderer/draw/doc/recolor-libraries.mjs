/**
 * Colour libraries for Recolor: with one chosen, every recoloured colour snaps to the nearest library colour.
 * Original modCut palettes, grouped as Illustrator's Color Library menu groups them; `items` make a submenu.
 */
const lib = (id, name, colors) => Object.freeze({ id, name, colors: Object.freeze(colors) });
const group = (name, items) => Object.freeze({ name, items: Object.freeze(items) });

export const RECOLOR_LIBRARIES = Object.freeze([
  group('Art History', [
    lib('art-renaissance', 'Renaissance', ['#5B3A29', '#8C5A3C', '#C49A6C', '#E8D3A9', '#2F4A3A', '#7A1F1F', '#B8860B', '#1E2A44']),
    lib('art-impressionism', 'Impressionism', ['#A7C7E7', '#F4D9A0', '#E8A9B8', '#9DC29B', '#6E8FB8', '#F2E9C9', '#C98F6B', '#7D6BA6']),
    lib('art-bauhaus', 'Bauhaus', ['#D62828', '#F7C21B', '#1D4E9E', '#111111', '#F2EFE6', '#8A8A8A']),
    lib('art-pop', 'Pop Art', ['#FF2A68', '#FFE600', '#00B4F0', '#FF7A00', '#111111', '#FFFFFF', '#7AE000']),
    lib('art-deco', 'Art Deco', ['#0F2A2E', '#1E5552', '#C9A227', '#E6D3A3', '#7B2D26', '#1A1A1A', '#F5F0E1']),
  ]),
  lib('celebration', 'Celebration', ['#E63946', '#F4A261', '#FFD166', '#06D6A0', '#118AB2', '#8338EC', '#FF70A6', '#FFFFFF']),
  lib('corporate', 'Corporate', ['#0B2545', '#13315C', '#134074', '#3E7CB1', '#8DA9C4', '#EEF4ED', '#5C6770', '#C8102E']),
  lib('earthtone', 'Earthtone', ['#5C4033', '#8B5A2B', '#A0522D', '#C19A6B', '#D2B48C', '#6B8E23', '#556B2F', '#8F9779', '#3E3B32']),
  group('Foods', [
    lib('food-beverages', 'Beverages', ['#3B1F0E', '#6F4E37', '#C8A27A', '#F1E3C8', '#B5172E', '#F2B33D', '#8DB600', '#E9F1F7']),
    lib('food-fruit', 'Fruit', ['#D7263D', '#F46036', '#FFB627', '#F9E900', '#7BC950', '#6B2D5C', '#FF8FAB', '#4E8A3E']),
    lib('food-ice-cream', 'Ice Cream', ['#FCE1E4', '#FFF1C1', '#C7F0DB', '#D7C4F2', '#8B5E3C', '#F5D0A9', '#BDE0FE', '#FFFFFF']),
    lib('food-sweets', 'Sweets', ['#FF5DA2', '#FFB3D1', '#A0E7E5', '#B4F8C8', '#FBE7C6', '#7F5539', '#E63946', '#FFD60A']),
    lib('food-vegetables', 'Vegetables', ['#2D6A4F', '#52B788', '#95D5B2', '#E76F51', '#F4A261', '#6A0572', '#E9C46A', '#8D5524']),
  ]),
  lib('kids', 'Kids Stuff', ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93', '#FF924C', '#52D1DC', '#FFFFFF']),
  lib('metal', 'Metal', ['#2B2B2B', '#4F4F4F', '#7A7A7A', '#A8A9AD', '#D4D4D4', '#B87333', '#D4AF37', '#8C7853', '#C0C0C0']),
  group('Nature', [
    lib('nature-forest', 'Forest', ['#1B4332', '#2D6A4F', '#40916C', '#74C69D', '#5C4033', '#A68A64', '#DDE5B6', '#283618']),
    lib('nature-ocean', 'Ocean', ['#03045E', '#023E8A', '#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8', '#F1E3C8', '#2A9D8F']),
    lib('nature-flowers', 'Flowers', ['#E5989B', '#B5838D', '#FFB4A2', '#F9DC5C', '#C77DFF', '#7B2CBF', '#80B918', '#FFFFFF']),
    lib('nature-desert', 'Desert', ['#E9C46A', '#F4A261', '#E76F51', '#C2763B', '#8A5A44', '#F7E1C3', '#6B705C', '#A5A58D']),
    lib('nature-autumn', 'Autumn', ['#7F2704', '#A63603', '#D94801', '#F16913', '#FDAE6B', '#8C510A', '#BF812D', '#543005']),
  ]),
  lib('neutral', 'Neutral', ['#FFFFFF', '#F2F0EB', '#D9D4CA', '#B5AFA3', '#8C877D', '#5E5A53', '#33312D', '#111111']),
  group('Scientific', [
    lib('sci-viridis', 'Viridis', ['#440154', '#46327E', '#365C8D', '#277F8E', '#1FA187', '#4AC16D', '#A0DA39', '#FDE725']),
    lib('sci-magma', 'Magma', ['#000004', '#1C1044', '#4F127B', '#812581', '#B5367A', '#E55064', '#FB8761', '#FEC287', '#FCFDBF']),
    lib('sci-diverging', 'Diverging', ['#2166AC', '#4393C3', '#92C5DE', '#F7F7F7', '#F4A582', '#D6604D', '#B2182B']),
  ]),
  lib('skintones', 'Skintones', ['#FFE0C4', '#F3C9A8', '#E5B08E', '#D49B76', '#C18560', '#A86E4B', '#8D5A3B', '#6E442B', '#4E2F1E', '#2F1C12']),
  lib('textiles', 'Textiles', ['#1F3A5F', '#4A6FA5', '#C9ADA7', '#9A8C98', '#F2E9E4', '#7D4E57', '#D9A441', '#2E4A3F']),
  lib('web', 'Web', ['#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF', '#FF6600', '#6600CC', '#009933', '#003366']),
  lib('laser', 'Laser Layers', ['#000000', '#FF0000', '#0000FF', '#00A000', '#FF00FF', '#00C0C0', '#FF8000', '#808080']),
]);
export const recolorLibraries = () => RECOLOR_LIBRARIES.flatMap((entry) => entry.items ?? [entry]);
export const recolorLibrary = (id) => recolorLibraries().find((entry) => entry.id === id) ?? null;
