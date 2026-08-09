package no.horten.modcut;

import com.fasterxml.jackson.databind.JsonNode;
import de.thomas_oster.liblasercut.LaserJob;
import de.thomas_oster.liblasercut.VectorPart;
import de.thomas_oster.liblasercut.platform.Util;
import de.thomas_oster.liblasercut.properties.PowerSpeedFocusFrequencyProperty;

/** Converts modCut's device-neutral vector segments to a LibLaserCut Epilog job. */
final class EpilogJobBuilder {
  static final double DPI = 500;
  static final double MIN_FOCUS_MM = -12.6;
  static final double MAX_FOCUS_MM = 12.6;
  private static final double EPSILON = 0.01;
  private static final int MAX_SEGMENTS = 100_000;
  private static final int MAX_POINTS = 500_000;

  record Built(LaserJob job, int segmentCount, int pointCount, boolean frequencyClamped) {}

  private EpilogJobBuilder() {}

  static Built build(JsonNode params, double bedWidth, double bedHeight) {
    JsonNode segments = params.path("laserSegments");
    if (!segments.isArray() || segments.isEmpty()) {
      throw new IllegalArgumentException("Epilog-jobben inneholder ingen vektorsegmenter.");
    }
    if (segments.size() > MAX_SEGMENTS) {
      throw new IllegalArgumentException("Epilog-jobben er for stor (maks " + MAX_SEGMENTS + " segmenter).");
    }

    String title = cleanTitle(params.path("filename").asText("modcut-job"));
    String name = cleanQueueName(title);
    String user = cleanQueueName(System.getProperty("user.name", "modcut"));
    LaserJob job = new LaserJob(title, name, user);
    job.setAutoFocusEnabled(false);

    PowerSpeedFocusFrequencyProperty initial = property(0, 100, 5000, 0);
    VectorPart vectors = new VectorPart(initial, DPI);
    int pointCount = 0;
    boolean frequencyClamped = false;

    for (int segmentIndex = 0; segmentIndex < segments.size(); segmentIndex++) {
      JsonNode segment = segments.get(segmentIndex);
      JsonNode points = segment.path("points");
      if (!points.isArray() || points.size() < 2) {
        throw invalidSegment(segmentIndex, "må ha minst to punkter");
      }
      pointCount += points.size();
      if (pointCount > MAX_POINTS) {
        throw new IllegalArgumentException("Epilog-jobben er for stor (maks " + MAX_POINTS + " punkter).");
      }

      double power = bounded(segment, "power", 0, 100, segmentIndex);
      double speed = bounded(segment, "speed", 1, 100, segmentIndex);
      double focus = bounded(segment, "focus", MIN_FOCUS_MM, MAX_FOCUS_MM, segmentIndex);
      int requestedFrequency = (int) Math.round(finite(segment, "frequency", segmentIndex));
      int frequency = Math.max(100, Math.min(5000, requestedFrequency));
      frequencyClamped |= frequency != requestedFrequency;
      vectors.setProperty(property(power, speed, frequency, focus));

      JsonNode first = points.get(0);
      vectors.moveto(px(coordinate(first, "x", bedWidth, segmentIndex)), px(coordinate(first, "y", bedHeight, segmentIndex)));
      for (int pointIndex = 1; pointIndex < points.size(); pointIndex++) {
        JsonNode point = points.get(pointIndex);
        vectors.lineto(px(coordinate(point, "x", bedWidth, segmentIndex)), px(coordinate(point, "y", bedHeight, segmentIndex)));
      }
    }

    job.addPart(vectors);
    return new Built(job, segments.size(), pointCount, frequencyClamped);
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

  private static void validateCoordinate(double value, double maximum, String axis) {
    if (!Double.isFinite(value) || value < -EPSILON || value > maximum + EPSILON) {
      throw new IllegalArgumentException(axis + "-posisjon " + value + " er utenfor maskinens arbeidsområde.");
    }
  }

  private static double bounded(JsonNode node, String key, double minimum, double maximum, int segmentIndex) {
    double value = finite(node, key, segmentIndex);
    if (value < minimum || value > maximum) {
      throw invalidSegment(segmentIndex, key + " må være mellom " + minimum + " og " + maximum);
    }
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
