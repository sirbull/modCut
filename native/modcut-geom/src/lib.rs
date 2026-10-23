//! D0.3 experiment only; not loaded by modCut. Original adapter, no upstream code copied.
//! Upstream: storytold/vectorcraft @ 0a33cff3f6e2a1e9e672f4c3816f58cd8d3d032e,
//! MIT OR Apache-2.0. Handles are relative in modCut, absolute in VectorCraft.
use serde::{Deserialize, Serialize};
use vectorcraft_geom::{Anchor, FillRule, PathData, Point, SubPath};
use vectorcraft_pathops::{BoolOp, try_boolean};
use wasm_bindgen::prelude::*;

#[derive(Deserialize, Serialize)]
struct Segment {
    p: [f64; 2],
    #[serde(rename = "in")]
    h_in: [f64; 2],
    #[serde(rename = "out")]
    h_out: [f64; 2],
}
#[derive(Deserialize, Serialize)]
struct Contour { closed: bool, segments: Vec<Segment> }
#[derive(Deserialize)]
struct BooleanInput { op: String, a: Vec<Contour>, b: Vec<Contour>, #[serde(default)] evenodd: bool }
fn error(message: impl ToString) -> JsValue { JsValue::from_str(&message.to_string()) }
fn path(contours: Vec<Contour>) -> Result<PathData, JsValue> {
    let mut subpaths = Vec::new();
    for contour in contours {
        let mut anchors = Vec::new();
        for s in contour.segments {
            if !s.p.iter().chain(s.h_in.iter()).chain(s.h_out.iter()).all(|v| v.is_finite()) {
                return Err(error("Nonfinite coordinate"));
            }
            let p = Point::new(s.p[0], s.p[1]);
            let mut anchor = Anchor::corner(p);
            anchor.h_in = Point::new(p.x + s.h_in[0], p.y + s.h_in[1]);
            anchor.h_out = Point::new(p.x + s.h_out[0], p.y + s.h_out[1]);
            anchors.push(anchor);
        }
        subpaths.push(SubPath::new(anchors, contour.closed));
    }
    Ok(PathData::new(subpaths))
}
fn contours(path: &PathData) -> Vec<Contour> {
    path.subpaths.iter().map(|subpath| Contour {
        closed: subpath.closed,
        segments: subpath.anchors.iter().map(|a| Segment {
            p: [a.p.x, a.p.y], h_in: [a.h_in.x - a.p.x, a.h_in.y - a.p.y],
            h_out: [a.h_out.x - a.p.x, a.h_out.y - a.p.y],
        }).collect(),
    }).collect()
}
#[wasm_bindgen]
pub fn boolean_json(input: &str) -> Result<String, JsValue> {
    let input: BooleanInput = serde_json::from_str(input).map_err(error)?;
    let op = match input.op.as_str() {
        "unite" => BoolOp::Union, "intersect" => BoolOp::Intersect,
        "minusFront" => BoolOp::Difference, "exclude" => BoolOp::Xor,
        _ => return Err(error("Unsupported spike operation")),
    };
    let rule = if input.evenodd { FillRule::EvenOdd } else { FillRule::NonZero };
    let result = try_boolean(&path(input.a)?, rule, &path(input.b)?, rule, op, 0.001).map_err(error)?;
    serde_json::to_string(&contours(&result)).map_err(error)
}
#[wasm_bindgen]
pub fn trace_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<String, JsValue> {
    let pixels = u64::from(width) * u64::from(height);
    if pixels == 0 || pixels > 2_000_000 || pixels * 4 != rgba.len() as u64 {
        return Err(error("Spike expects 1..2,000,000 RGBA pixels"));
    }
    let raster = vectorcraft_trace::Raster { width, height, rgba: rgba.to_vec() };
    let params = vectorcraft_trace::TraceParams { ignore_white: true, ..Default::default() };
    let traced = vectorcraft_trace::trace_within(&raster, &params, 200_000).map_err(error)?;
    serde_json::to_string(&traced.paths.iter().map(|p| contours(&p.path)).collect::<Vec<_>>()).map_err(error)
}
#[derive(Deserialize)]
struct PdfInput { width: f64, height: f64, paths: Vec<Vec<Contour>> }
#[wasm_bindgen]
pub fn write_pdf(input: &str) -> Result<Vec<u8>, JsValue> {
    use vectorcraft_color::{Color, Paint};
    use vectorcraft_doc::{Appearance, Document, Node};
    let input: PdfInput = serde_json::from_str(input).map_err(error)?;
    if !input.width.is_finite() || !input.height.is_finite() || input.width <= 0.0 || input.height <= 0.0 {
        return Err(error("Invalid artboard size"));
    }
    // Upstream documents use points. Our bridge retains mm until this export boundary.
    let scale = 72.0 / 25.4;
    let mut doc = Document::new(input.width * scale, input.height * scale);
    let parent = doc.default_layer().ok_or_else(|| error("No PDF layer"))?;
    for (i, source) in input.paths.into_iter().enumerate() {
        let mut geometry = path(source)?;
        for subpath in &mut geometry.subpaths { for anchor in &mut subpath.anchors {
            anchor.p = Point::new(anchor.p.x * scale, anchor.p.y * scale);
            anchor.h_in = Point::new(anchor.h_in.x * scale, anchor.h_in.y * scale);
            anchor.h_out = Point::new(anchor.h_out.x * scale, anchor.h_out.y * scale);
        }}
        let appearance = Appearance::basic(Paint::solid(Color::rgb(0.0, 0.0, 0.0)), Paint::None, 0.0);
        let id = doc.alloc_id();
        doc.insert(Some(parent), i, Node::path(id, geometry, appearance)).map_err(error)?;
    }
    vectorcraft_pdf::export(&doc, &vectorcraft_pdf::PdfOptions { created: Some(0), ..Default::default() }).map_err(error)
}
