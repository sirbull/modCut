package no.horten.modcut;

import com.fasterxml.jackson.databind.JsonNode;
import de.thomas_oster.liblasercut.BlackWhiteRaster;
import de.thomas_oster.liblasercut.GreyRaster;
import de.thomas_oster.liblasercut.JobPart;
import de.thomas_oster.liblasercut.LaserJob;
import de.thomas_oster.liblasercut.Raster3dPart;
import de.thomas_oster.liblasercut.RasterPart;
import de.thomas_oster.liblasercut.VectorPart;
import de.thomas_oster.liblasercut.drivers.EpilogEngraveProperty;
import de.thomas_oster.liblasercut.platform.Point;
import de.thomas_oster.liblasercut.platform.Util;
import de.thomas_oster.liblasercut.properties.PowerSpeedFocusFrequencyProperty;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Converts modCut's device-neutral segments to native LibLaserCut Epilog job parts. */
final class EpilogJobBuilder {
  static final double DPI = 500;
  static final double MIN_FOCUS_MM = -12.6;
  static final double MAX_FOCUS_MM = 12.6;
  private static final double EPSILON = 0.01;
  private static final int MAX_SEGMENTS = 100_000;
  private static final int MAX_POINTS = 500_000;
  private static final long MAX_BINARY_RASTER_PIXELS = 120_000_000L;
  private static final long MAX_GRAYSCALE_RASTER_PIXELS = 32_000_000L;
  private static final List<Integer> EPILOG_RASTER_DPIS = List.of(100, 200, 250, 400, 500, 1000);

  private record DevicePoint(double xMm, double yMm, int xDevice, int yDevice) {}
  private record IndexedSegment(int index, JsonNode node) {}
  private record VectorBuild(VectorPart part, int pointCount, boolean frequencyClamped) {}
  private record RasterBounds(int minX, int minY, int maxXExclusive, int maxYInclusive) {
    int width() { return maxXExclusive - minX; }
    int height() { return maxYInclusive - minY + 1; }
    long pixels() { return (long) width() * height(); }
  }

  record Built(LaserJob job, int segmentCount, int pointCount, boolean frequencyClamped) {}

  private EpilogJobBuilder() {}

  static Built build(JsonNode params, double bedWidth, double bedHeight) {
    JsonNode segments = params.path("laserSegments");
    if (!segments.isArray() || segments.isEmpty()) {
      throw new IllegalArgumentException("Epilog-jobben inneholder ingen lasersegmenter.");
    }
    if (segments.size() > MAX_SEGMENTS) {
      throw new IllegalArgumentException("Epilog-jobben er for stor (maks " + MAX_SEGMENTS + " segmenter).");
    }

    String title = cleanTitle(params.path("filename").asText("modcut-job"));
    LaserJob job = new LaserJob(title, cleanQueueName(title), cleanQueueName(System.getProperty("user.name", "modcut")));
    job.setAutoFocusEnabled(false);

    Map<Integer, List<IndexedSegment>> layers = new LinkedHashMap<>();
    int sourcePointCount = 0;
    for (int i = 0; i < segments.size(); i++) {
      JsonNode segment = segments.get(i);
      JsonNode points = segment.path("points");
      if (!points.isArray() || points.size() < 2) throw invalidSegment(i, "må ha minst to punkter");
      sourcePointCount += points.size();
      if (sourcePointCount > MAX_POINTS) {
        throw new IllegalArgumentException("Epilog-jobben er for stor (maks " + MAX_POINTS + " punkter).");
      }
      int layerIndex = Math.max(0, segment.path("layerIndex").asInt(0));
      layers.computeIfAbsent(layerIndex, ignored -> new ArrayList<>()).add(new IndexedSegment(i, segment));
    }

    List<IndexedSegment> pendingVectors = new ArrayList<>();
    int pointCount = 0;
    boolean frequencyClamped = false;
    for (List<IndexedSegment> layer : layers.values()) {
      List<IndexedSegment> nativeRaster = layer.stream().filter(EpilogJobBuilder::usesNativeRaster).toList();
      List<IndexedSegment> vectors = layer.stream().filter(segment -> !usesNativeRaster(segment)).toList();
      if (!nativeRaster.isEmpty()) {
        if (!pendingVectors.isEmpty()) {
          VectorBuild built = buildVectors(pendingVectors, bedWidth, bedHeight);
          job.addPart(built.part());
          pointCount += built.pointCount();
          frequencyClamped |= built.frequencyClamped();
          pendingVectors.clear();
        }
        JobPart raster = buildNativeRaster(nativeRaster, bedWidth, bedHeight);
        job.addPart(raster);
        pointCount += nativeRaster.stream().mapToInt(segment -> segment.node().path("points").size()).sum();
      }
      pendingVectors.addAll(vectors);
    }
    if (!pendingVectors.isEmpty()) {
      VectorBuild built = buildVectors(pendingVectors, bedWidth, bedHeight);
      job.addPart(built.part());
      pointCount += built.pointCount();
      frequencyClamped |= built.frequencyClamped();
    }

    return new Built(job, segments.size(), pointCount, frequencyClamped);
  }

  private static boolean usesNativeRaster(IndexedSegment indexed) {
    JsonNode segment = indexed.node();
    if (!segment.path("operation").asText("").equalsIgnoreCase("Engrave") || !segment.path("raster").asBoolean(false)) return false;
    return !segment.path("engraveMode").asText("auto").equalsIgnoreCase("vector");
  }

  private static VectorBuild buildVectors(List<IndexedSegment> segments, double bedWidth, double bedHeight) {
    VectorPart vectors = new VectorPart(property(0, 100, 5000, 0), DPI);
    int pointCount = 0;
    boolean frequencyClamped = false;
    for (IndexedSegment indexed : segments) {
      int segmentIndex = indexed.index();
      JsonNode segment = indexed.node();
      double power = bounded(segment, "power", 0, 100, segmentIndex);
      double speed = bounded(segment, "speed", 1, 100, segmentIndex);
      double focus = bounded(segment, "focus", MIN_FOCUS_MM, MAX_FOCUS_MM, segmentIndex);
      int requestedFrequency = (int) Math.round(finite(segment, "frequency", segmentIndex));
      int frequency = Math.max(100, Math.min(5000, requestedFrequency));
      frequencyClamped |= frequency != requestedFrequency;
      vectors.setProperty(property(power, speed, frequency, focus));

      List<DevicePoint> devicePoints = new ArrayList<>();
      JsonNode points = segment.path("points");
      for (int pointIndex = 0; pointIndex < points.size(); pointIndex++) {
        DevicePoint point = devicePoint(points.get(pointIndex), bedWidth, bedHeight, segmentIndex);
        if (devicePoints.isEmpty() || !sameDevicePoint(devicePoints.get(devicePoints.size() - 1), point)) devicePoints.add(point);
      }
      if (devicePoints.size() < 2) throw invalidSegment(segmentIndex, "blir kortere enn ett Epilog-enhetstrinn");

      if (segment.path("closed").asBoolean(false)) {
        DevicePoint first = devicePoints.get(0);
        DevicePoint last = devicePoints.get(devicePoints.size() - 1);
        if (!sameDevicePoint(first, last)) devicePoints.add(first);
        if (segment.path("operation").asText("").equalsIgnoreCase("Cut")) {
          JsonNode overlapNode = segment.path("overlapPoint");
          DevicePoint overlap = overlapNode.isObject()
              ? devicePoint(overlapNode, bedWidth, bedHeight, segmentIndex)
              : overlapPoint(first, devicePoints.get(1));
          if (!sameDevicePoint(devicePoints.get(devicePoints.size() - 1), overlap)) devicePoints.add(overlap);
        }
      }

      pointCount += devicePoints.size();
      if (pointCount > MAX_POINTS) throw new IllegalArgumentException("Epilog-jobben er for stor (maks " + MAX_POINTS + " punkter).");
      DevicePoint first = devicePoints.get(0);
      vectors.moveto(first.xDevice(), first.yDevice());
      for (int i = 1; i < devicePoints.size(); i++) vectors.lineto(devicePoints.get(i).xDevice(), devicePoints.get(i).yDevice());
    }
    return new VectorBuild(vectors, pointCount, frequencyClamped);
  }

  private static JobPart buildNativeRaster(List<IndexedSegment> segments, double bedWidth, double bedHeight) {
    JsonNode first = segments.get(0).node();
    int dpi = (int) Math.round(finite(first, "dpi", segments.get(0).index()));
    if (!EPILOG_RASTER_DPIS.contains(dpi)) {
      throw invalidSegment(segments.get(0).index(), "DPI " + dpi + " støttes ikke av Epilog Zing (velg 100, 200, 250, 400, 500 eller 1000)");
    }
    boolean grayscale = first.path("dither").asText("").equalsIgnoreCase("Grayscale");
    double speed = bounded(first, "speed", 1, 100, segments.get(0).index());
    double focus = bounded(first, "focus", MIN_FOCUS_MM, MAX_FOCUS_MM, segments.get(0).index());
    double maxPower = first.has("maxPower")
        ? bounded(first, "maxPower", 0, 100, segments.get(0).index())
        : bounded(first, "power", 0, 100, segments.get(0).index());
    boolean bottomUp = first.path("bottomUp").asBoolean(true);

    RasterBounds bounds = rasterBounds(segments, dpi, bedWidth, bedHeight);
    long maximumPixels = grayscale ? MAX_GRAYSCALE_RASTER_PIXELS : MAX_BINARY_RASTER_PIXELS;
    if (bounds.width() <= 0 || bounds.height() <= 0 || bounds.pixels() > maximumPixels) {
      throw new IllegalArgumentException("Epilog-rasterlaget er for stort ved " + dpi + " DPI (" + bounds.width() + "×" + bounds.height() + " piksler). Reduser DPI eller del laget.");
    }

    EpilogEngraveProperty rasterProperty = new EpilogEngraveProperty(false);
    rasterProperty.setPower((float) maxPower);
    rasterProperty.setSpeed((float) speed);
    rasterProperty.setFocus((float) focus);
    rasterProperty.setProperty("bottom up", bottomUp);
    Point origin = new Point(bounds.minX(), bounds.minY());

    if (grayscale) {
      GreyRaster raster = new GreyRaster(bounds.width(), bounds.height());
      for (int y = 0; y < bounds.height(); y++) for (int x = 0; x < bounds.width(); x++) raster.setGreyScale(x, y, 255);
      paintRasterRuns(segments, dpi, bounds, bedWidth, bedHeight, (x, y, segment, power) -> {
        int grey = maxPower <= 0 ? 255 : (int) Math.round(255 * (1 - Math.min(1, power / maxPower)));
        if (grey < raster.getGreyScale(x, y)) raster.setGreyScale(x, y, grey);
      });
      return new Raster3dPart(raster, rasterProperty, origin, dpi);
    }

    BlackWhiteRaster raster = new BlackWhiteRaster(bounds.width(), bounds.height());
    paintRasterRuns(segments, dpi, bounds, bedWidth, bedHeight, (x, y, segment, power) -> raster.setBlack(x, y, true));
    return new RasterPart(raster, rasterProperty, origin, dpi);
  }

  @FunctionalInterface
  private interface PixelPainter { void paint(int x, int y, IndexedSegment segment, double power); }

  private static void paintRasterRuns(List<IndexedSegment> segments, int dpi, RasterBounds bounds,
                                      double bedWidth, double bedHeight, PixelPainter painter) {
    for (IndexedSegment segment : segments) {
      JsonNode points = segment.node().path("points");
      JsonNode a = points.get(0), b = points.get(points.size() - 1);
      double ay = coordinate(a, "y", bedHeight, segment.index());
      double by = coordinate(b, "y", bedHeight, segment.index());
      JsonNode encodedSamples = segment.node().path("samples");
      if (encodedSamples.isTextual()) {
        byte[] samples;
        try {
          samples = Base64.getDecoder().decode(encodedSamples.asText());
        } catch (IllegalArgumentException error) {
          throw invalidSegment(segment.index(), "rasterraden har ugyldige samples");
        }
        if (samples.length == 0) throw invalidSegment(segment.index(), "rasterraden mangler samples");
        double left = coordinate(a, "x", bedWidth, segment.index());
        double right = coordinate(b, "x", bedWidth, segment.index());
        double maxPower = bounded(segment.node(), "maxPower", 0, 100, segment.index());
        int start = 0;
        int value = Byte.toUnsignedInt(samples[0]);
        for (int sample = 1; sample <= samples.length; sample++) {
          int next = sample < samples.length ? Byte.toUnsignedInt(samples[sample]) : -1;
          if (next == value) continue;
          if (value > 0) {
            double runLeft = left + (right - left) * start / samples.length;
            double runRight = left + (right - left) * sample / samples.length;
            paintRasterRange(segment, maxPower * value / 255.0, runLeft, runRight, ay, by, dpi, bounds, painter);
          }
          start = sample;
          value = next;
        }
        continue;
      }
      JsonNode compactRuns = segment.node().path("runs");
      if (compactRuns.isArray()) {
        if (compactRuns.isEmpty()) throw invalidSegment(segment.index(), "komprimert rasterrad mangler runs");
        for (JsonNode run : compactRuns) {
          double left = coordinate(run, "left", bedWidth, segment.index());
          double right = coordinate(run, "right", bedWidth, segment.index());
          double power = bounded(run, "power", 0, 100, segment.index());
          paintRasterRange(segment, power, left, right, ay, by, dpi, bounds, painter);
        }
        continue;
      }
      double ax = coordinate(a, "x", bedWidth, segment.index());
      double bx = coordinate(b, "x", bedWidth, segment.index());
      double power = bounded(segment.node(), "power", 0, 100, segment.index());
      paintRasterRange(segment, power, ax, bx, ay, by, dpi, bounds, painter);
    }
  }

  private static void paintRasterRange(IndexedSegment segment, double power,
                                       double ax, double bx, double ay, double by,
                                       int dpi, RasterBounds bounds, PixelPainter painter) {
    int y = (int) Math.round(Util.mm2px((ay + by) / 2, dpi)) - bounds.minY();
    int start = (int) Math.floor(Util.mm2px(Math.min(ax, bx), dpi) + 1e-6) - bounds.minX();
    int endExclusive = (int) Math.ceil(Util.mm2px(Math.max(ax, bx), dpi) - 1e-6) - bounds.minX();
    if (endExclusive <= start) endExclusive = start + 1;
    start = Math.max(0, start);
    endExclusive = Math.min(bounds.width(), endExclusive);
    if (y < 0 || y >= bounds.height()) return;
    for (int x = start; x < endExclusive; x++) painter.paint(x, y, segment, power);
  }

  private static RasterBounds rasterBounds(List<IndexedSegment> segments, int dpi, double bedWidth, double bedHeight) {
    int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, maxY = Integer.MIN_VALUE;
    for (IndexedSegment segment : segments) {
      JsonNode points = segment.node().path("points");
      JsonNode a = points.get(0), b = points.get(points.size() - 1);
      double ax = coordinate(a, "x", bedWidth, segment.index());
      double ay = coordinate(a, "y", bedHeight, segment.index());
      double bx = coordinate(b, "x", bedWidth, segment.index());
      double by = coordinate(b, "y", bedHeight, segment.index());
      minX = Math.min(minX, (int) Math.floor(Util.mm2px(Math.min(ax, bx), dpi) + 1e-6));
      maxX = Math.max(maxX, (int) Math.ceil(Util.mm2px(Math.max(ax, bx), dpi) - 1e-6));
      minY = Math.min(minY, (int) Math.round(Util.mm2px((ay + by) / 2, dpi)));
      maxY = Math.max(maxY, (int) Math.round(Util.mm2px((ay + by) / 2, dpi)));
    }
    return new RasterBounds(minX, minY, Math.max(minX + 1, maxX), maxY);
  }

  static Built frame(String filename, double minX, double minY, double maxX, double maxY,
                     double bedWidth, double bedHeight) {
    validateCoordinate(minX, bedWidth, "X");
    validateCoordinate(maxX, bedWidth, "X");
    validateCoordinate(minY, bedHeight, "Y");
    validateCoordinate(maxY, bedHeight, "Y");
    if (minX > maxX || minY > maxY) throw new IllegalArgumentException("Ugyldig rammegeometri.");

    String title = cleanTitle(filename);
    LaserJob job = new LaserJob(title, cleanQueueName(title), cleanQueueName(System.getProperty("user.name", "modcut")));
    job.setAutoFocusEnabled(false);
    VectorPart vectors = new VectorPart(property(0, 50, 5000, 0), DPI);
    vectors.moveto(px(minX), px(minY));
    vectors.lineto(px(maxX), px(minY));
    vectors.lineto(px(maxX), px(maxY));
    vectors.lineto(px(minX), px(maxY));
    vectors.lineto(px(minX), px(minY));
    job.addPart(vectors);
    return new Built(job, 1, 5, false);
  }

  private static PowerSpeedFocusFrequencyProperty property(double power, double speed, int frequency, double focus) {
    var property = new PowerSpeedFocusFrequencyProperty(false);
    property.setPower((float) power);
    property.setSpeed((float) speed);
    property.setFrequency(frequency);
    property.setFocus((float) focus);
    return property;
  }

  private static double coordinate(JsonNode point, String key, double maximum, int segmentIndex) {
    double value = finite(point, key, segmentIndex);
    validateCoordinate(value, maximum, key.toUpperCase());
    return value;
  }

  private static DevicePoint devicePoint(JsonNode point, double bedWidth, double bedHeight, int segmentIndex) {
    double x = coordinate(point, "x", bedWidth, segmentIndex);
    double y = coordinate(point, "y", bedHeight, segmentIndex);
    return new DevicePoint(x, y, (int) px(x), (int) px(y));
  }

  private static DevicePoint overlapPoint(DevicePoint first, DevicePoint next) {
    double dx = next.xMm() - first.xMm(), dy = next.yMm() - first.yMm();
    double distance = Math.hypot(dx, dy);
    if (distance <= 0) return first;
    double ratio = Math.min(0.1, distance) / distance;
    double x = first.xMm() + dx * ratio, y = first.yMm() + dy * ratio;
    return new DevicePoint(x, y, (int) px(x), (int) px(y));
  }

  private static boolean sameDevicePoint(DevicePoint a, DevicePoint b) {
    return a.xDevice() == b.xDevice() && a.yDevice() == b.yDevice();
  }

  private static void validateCoordinate(double value, double maximum, String axis) {
    if (!Double.isFinite(value) || value < -EPSILON || value > maximum + EPSILON) {
      throw new IllegalArgumentException(axis + "-posisjon " + value + " er utenfor maskinens arbeidsområde.");
    }
  }

  private static double bounded(JsonNode node, String key, double minimum, double maximum, int segmentIndex) {
    double value = finite(node, key, segmentIndex);
    if (value < minimum || value > maximum) throw invalidSegment(segmentIndex, key + " må være mellom " + minimum + " og " + maximum);
    return value;
  }

  private static double finite(JsonNode node, String key, int segmentIndex) {
    double value = node.path(key).asDouble(Double.NaN);
    if (!Double.isFinite(value)) throw invalidSegment(segmentIndex, "mangler gyldig " + key);
    return value;
  }

  private static double px(double millimetres) { return Util.mm2px(millimetres, DPI); }

  private static String cleanTitle(String value) {
    String clean = value == null ? "modcut-job" : value.replaceAll("[\\r\\n\\p{Cntrl}]", " ").trim();
    return clean.isBlank() ? "modcut-job" : clean.substring(0, Math.min(80, clean.length()));
  }

  private static String cleanQueueName(String value) {
    String clean = cleanTitle(value).replaceAll("[^A-Za-z0-9_-]", "_");
    return clean.substring(0, Math.min(32, clean.length()));
  }

  private static IllegalArgumentException invalidSegment(int zeroBasedIndex, String message) {
    return new IllegalArgumentException("Ugyldig Epilog-segment " + (zeroBasedIndex + 1) + ": " + message + ".");
  }
}
