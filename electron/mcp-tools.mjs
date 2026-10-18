// The tools modCut's MCP server offers. Shared by the main process (tools/list) and the renderer, which runs
// them against the active Draw document. Lengths are millimetres; x and y count from the top-left corner of
// the artboard (the active one unless artboardId is given), with y down.

const color = { type: ["string", "null"], description: "A CSS hex colour such as #FF0000, or null for none." };
const id = { type: "string" };
const artboardId = { type: "string", description: "Artboard id from document_info; the active artboard when left out." };

export const MCP_TOOLS = Object.freeze([
  { name: "document_info", title: "Document info",
    description: "The active Draw document: name, units, artboards (id, name, position and size in mm), layers, object count and the current selection. Call this first.",
    inputSchema: { type: "object", properties: {} } },
  { name: "list_objects", title: "List objects",
    description: "Objects in the active Draw document, top level first: id, type, name, layer, bounds in mm (document coordinates), fill and stroke.",
    inputSchema: { type: "object", properties: { layerId: { type: "string", description: "Only this layer." }, limit: { type: "integer", minimum: 1, maximum: 2000, default: 200 } } } },
  { name: "new_document", title: "New Draw document",
    description: "Open a new Draw document in its own tab with one artboard.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 } }, required: ["width", "height"] } },
  { name: "add_artboard", title: "Add artboard",
    description: "Add an artboard. x and y are document coordinates in mm; left out, it is placed to the right of the others.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 } }, required: ["width", "height"] } },
  { name: "add_shape", title: "Add shape",
    description: "Draw a live shape. Rectangles and ellipses use x, y, width and height; polygons and stars use x, y as the centre and radius; lines go from x, y to x2, y2. Returns the new object's id.",
    inputSchema: { type: "object", properties: {
      shape: { type: "string", enum: ["rectangle", "rounded-rectangle", "ellipse", "polygon", "star", "line"] },
      x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, radius: { type: "number" },
      x2: { type: "number" }, y2: { type: "number" }, points: { type: "integer", minimum: 3, maximum: 100, description: "Sides of a polygon or points of a star." },
      cornerRadius: { type: "number" }, fill: color, stroke: color, strokeWidth: { type: "number", minimum: 0 }, name: { type: "string" }, artboardId,
    }, required: ["shape", "x", "y"] } },
  { name: "add_svg", title: "Add SVG artwork",
    description: "Import SVG markup (paths, shapes, text, groups) as editable objects, placed at x, y on the artboard. Returns the new ids.",
    inputSchema: { type: "object", properties: { svg: { type: "string" }, x: { type: "number", default: 0 }, y: { type: "number", default: 0 }, artboardId }, required: ["svg"] } },
  { name: "update_object", title: "Update object",
    description: "Change an object's name, paint, opacity, visibility or lock, or move it by dx, dy mm. One undo step.",
    inputSchema: { type: "object", properties: { id, name: { type: "string" }, fill: color, stroke: color, strokeWidth: { type: "number", minimum: 0 },
      opacity: { type: "number", minimum: 0, maximum: 1 }, visible: { type: "boolean" }, locked: { type: "boolean" }, dx: { type: "number" }, dy: { type: "number" } }, required: ["id"] } },
  { name: "delete_objects", title: "Delete objects", description: "Delete objects by id. One undo step.",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: id, minItems: 1 } }, required: ["ids"] } },
  { name: "select_objects", title: "Select objects", description: "Select objects by id (an empty list deselects), for run_command.",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: id } }, required: ["ids"] } },
  { name: "run_command", title: "Run a Draw command",
    description: "Run a Draw menu command on the selection (or on ids, selected first), for example group, ungroup, pathfinder-unite, pathfinder-minus-front, make-compound, outline-stroke, align-left, bring-to-front, undo or redo. list_commands gives every name.",
    inputSchema: { type: "object", properties: { command: { type: "string" }, ids: { type: "array", items: id } }, required: ["command"] } },
  { name: "list_commands", title: "List Draw commands", description: "The command names run_command accepts.",
    inputSchema: { type: "object", properties: {} } },
  { name: "export_artboard", title: "Export artboard",
    description: "An artboard as SVG text or as a PNG image.",
    inputSchema: { type: "object", properties: { artboardId, format: { type: "string", enum: ["svg", "png"], default: "png" }, ppi: { type: "number", minimum: 9, maximum: 600, default: 96 } } } },
  { name: "send_to_cut", title: "Send to Cut", description: "Send an artboard to the Cut workspace for laser output, as Draw's Send to Cut does.",
    inputSchema: { type: "object", properties: { artboardId } } },
]);
