package no.horten.modcut;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fazecast.jSerialComm.SerialPort;
import de.thomas_oster.liblasercut.drivers.Grbl;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class MachineController implements AutoCloseable {
  private final ObjectMapper json;
  private final ExecutorService jobs = Executors.newSingleThreadExecutor(r -> {
    Thread thread = new Thread(r, "modcut-grbl-job");
    thread.setDaemon(true);
    return thread;
  });
  private final AtomicBoolean cancelRequested = new AtomicBoolean();
  private volatile GrblTransport transport;
  private volatile boolean dryRun = true;
  private volatile boolean running;
  private volatile int linesSent;
  private volatile int totalLines;
  private volatile String lastError = "";
  private volatile String lastResult = "idle";
  private volatile String jobName = "";

  MachineController(ObjectMapper json) { this.json = json; }

  JsonNode handle(String method, JsonNode params) throws Exception {
    return switch (method) {
      case "ping" -> ping();
      case "listDrivers" -> listDrivers();
      case "listSerialPorts" -> listSerialPorts();
      case "connect" -> connect(params);
      case "disconnect" -> disconnect();
      case "status" -> status();
      case "buildJob", "validateJob" -> validateJob(params);
      case "frameJob" -> frameJob(params);
      case "startJob" -> startJob(params);
      case "cancelJob" -> cancelJob();
      default -> throw new IllegalArgumentException("Ukjent metode: " + method);
    };
  }

  private ObjectNode ping() {
    ObjectNode out = status();
    out.put("pong", true);
    out.put("driver", "M1 sidecar");
    out.put("ready", true);
    return out;
  }

  private ObjectNode listDrivers() {
    Grbl libLaserCutDriver = new Grbl();
    ObjectNode out = json.createObjectNode();
    ArrayNode drivers = out.putArray("drivers");
    drivers.add("Dummy");
    drivers.add("Grbl");
    out.put("grblModel", libLaserCutDriver.getModelName());
    out.put("library", "LibLaserCut");
    return out;
  }

  private ObjectNode listSerialPorts() {
    ObjectNode out = json.createObjectNode();
    ArrayNode ports = out.putArray("ports");
    for (SerialPort port : SerialPort.getCommPorts()) {
      ObjectNode item = ports.addObject();
      item.put("path", port.getSystemPortName());
      item.put("name", port.getDescriptivePortName());
    }
    return out;
  }

  private synchronized ObjectNode connect(JsonNode params) throws IOException {
    if (running) throw new IllegalStateException("Kan ikke bytte tilkobling mens en jobb kjører.");
    closeTransport();
    JsonNode machine = params.path("machine");
    String driver = machine.path("driver").asText("Dummy");
    dryRun = params.path("dryRun").asBoolean(true) || driver.equalsIgnoreCase("Dummy");
    JsonNode conn = machine.path("conn");
    String type = conn.path("type").asText("usb");
    String target = type.equals("network")
        ? conn.path("host").asText("?") + ":" + conn.path("port").asInt(23)
        : conn.path("serial").asText("USB");
    if (dryRun) {
      transport = GrblTransport.dryRun(machine.path("name").asText("maskin") + " · " + target);
    } else {
      if (!driver.equalsIgnoreCase("Grbl")) throw new IllegalArgumentException("M1 kan bare kjøre ekte jobber mot GRBL.");
      transport = type.equals("network")
          ? GrblTransport.network(
              conn.path("host").asText(),
              conn.path("port").asInt(23),
              boundedInt(conn, "connectTimeoutMs", 3_000, 250, 30_000),
              boundedInt(conn, "responseTimeoutMs", 30_000, 1_000, 120_000))
          : GrblTransport.serial(conn.path("serial").asText(), conn.path("baud").asInt(115200));
    }
    lastError = "";
    lastResult = "connected";
    return status();
  }

  private synchronized ObjectNode disconnect() throws IOException {
    if (running) throw new IllegalStateException("Avbryt den aktive jobben før frakobling.");
    closeTransport();
    lastResult = "disconnected";
    return status();
  }

  private ObjectNode validateJob(JsonNode params) {
    List<String> lines = lines(params);
    GcodeValidator.Report report = GcodeValidator.validate(lines, bedWidth(params), bedHeight(params), maxFeed(params));
    ObjectNode out = reportNode(report);
    out.put("format", "gcode");
    out.put("opCount", params.path("ops").size());
    out.put("valid", true);
    return out;
  }

  private ObjectNode frameJob(JsonNode params) {
    double minX = requiredFinite(params, "minX");
    double minY = requiredFinite(params, "minY");
    double maxX = requiredFinite(params, "maxX");
    double maxY = requiredFinite(params, "maxY");
    double frameFeed = Math.min(maxFeed(params), 3_000);
    List<String> frame = List.of(
        "; modCut frame - laser off", "G21", "G90", "M5",
        point("G0", minX, minY), point("G1", maxX, minY) + " F" + Math.round(frameFeed), point("G1", maxX, maxY),
        point("G1", minX, maxY), point("G1", minX, minY), "M5", "G0 X0 Y0");
    GcodeValidator.Report report = GcodeValidator.validate(frame, bedWidth(params), bedHeight(params), maxFeed(params));
    requireConnected();
    startAsync("frame", frame);
    ObjectNode out = reportNode(report);
    out.put("started", true);
    out.put("dryRun", dryRun);
    return out;
  }

  private ObjectNode startJob(JsonNode params) {
    requireConnected();
    if (!dryRun && !params.path("confirmed").asBoolean(false)) {
      throw new IllegalArgumentException("Ekte kjøring krever eksplisitt sikkerhetsbekreftelse.");
    }
    List<String> lines = lines(params);
    GcodeValidator.Report report = GcodeValidator.validate(lines, bedWidth(params), bedHeight(params), maxFeed(params));
    startAsync(params.path("filename").asText("job.gcode"), lines);
    ObjectNode out = reportNode(report);
    out.put("started", true);
    out.put("dryRun", dryRun);
    return out;
  }

  private synchronized void startAsync(String name, List<String> lines) {
    if (running) throw new IllegalStateException("En jobb kjører allerede.");
    running = true;
    cancelRequested.set(false);
    linesSent = 0;
    totalLines = lines.size();
    jobName = name;
    lastError = "";
    lastResult = "running";
    GrblTransport activeTransport = transport;
    jobs.submit(() -> {
      try {
        for (String raw : lines) {
          if (cancelRequested.get()) throw new InterruptedException("Jobben ble avbrutt.");
          String line = raw.replaceAll("\\([^)]*\\)", "").replaceFirst(";.*$", "").trim();
          if (!line.isEmpty()) activeTransport.sendLine(line);
          linesSent++;
        }
        lastResult = "completed";
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        lastResult = "cancelled";
      } catch (Exception error) {
        lastError = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        lastResult = "failed";
        try { activeTransport.emergencyStop(); } catch (Exception ignored) {}
        dropTransport(activeTransport);
      } finally {
        running = false;
      }
    });
  }

  private ObjectNode cancelJob() throws IOException {
    if (!running) return status();
    cancelRequested.set(true);
    transport.emergencyStop();
    lastResult = "cancelling";
    return status();
  }

  ObjectNode status() {
    ObjectNode out = json.createObjectNode();
    out.put("connected", transport != null);
    out.put("dryRun", dryRun);
    out.put("running", running);
    out.put("cancelRequested", cancelRequested.get());
    out.put("linesSent", linesSent);
    out.put("totalLines", totalLines);
    out.put("progress", totalLines == 0 ? 0 : Math.min(1, (double) linesSent / totalLines));
    out.put("lastError", lastError);
    out.put("lastResult", lastResult);
    out.put("jobName", jobName);
    out.put("target", transport == null ? "" : transport.description());
    out.put("connectionType", transport == null ? "" : transport.connectionType());
    out.put("deviceIdentity", transport == null ? "" : transport.identity());
    return out;
  }

  private ObjectNode reportNode(GcodeValidator.Report report) {
    ObjectNode out = json.createObjectNode();
    out.put("lineCount", report.lineCount());
    out.put("bytes", report.bytes());
    out.put("motionCount", report.motionCount());
    out.put("maxFeedSeen", report.maxFeedSeen());
    out.put("minX", report.minX()); out.put("minY", report.minY());
    out.put("maxX", report.maxX()); out.put("maxY", report.maxY());
    ArrayNode preview = out.putArray("preview");
    report.preview().forEach(preview::add);
    return out;
  }

  private void requireConnected() {
    if (transport == null) throw new IllegalStateException("Koble til maskinen (eller dry-run) først.");
  }

  private static List<String> lines(JsonNode params) {
    if (!params.path("gcodeLines").isArray()) throw new IllegalArgumentException("gcodeLines må være en liste.");
    List<String> out = new ArrayList<>();
    params.path("gcodeLines").forEach(line -> out.add(line.asText()));
    return List.copyOf(out);
  }

  private static double bedWidth(JsonNode params) { return params.path("bedWidth").asDouble(600); }
  private static double bedHeight(JsonNode params) { return params.path("bedHeight").asDouble(400); }
  private static double maxFeed(JsonNode params) { return params.path("maxFeed").asDouble(12_000); }

  private static int boundedInt(JsonNode node, String key, int fallback, int min, int max) {
    int value = node.path(key).asInt(fallback);
    if (value < min || value > max) throw new IllegalArgumentException(key + " må være mellom " + min + " og " + max + ".");
    return value;
  }

  private static double requiredFinite(JsonNode params, String key) {
    double value = params.path(key).asDouble(Double.NaN);
    if (!Double.isFinite(value)) throw new IllegalArgumentException("Mangler gyldig " + key + ".");
    return value;
  }

  private static String point(String command, double x, double y) {
    return String.format(java.util.Locale.ROOT, "%s X%.3f Y%.3f", command, x, y);
  }

  private synchronized void closeTransport() throws IOException {
    if (transport != null) transport.close();
    transport = null;
  }

  private synchronized void dropTransport(GrblTransport failed) {
    if (transport != failed) return;
    try { transport.close(); } catch (Exception ignored) {}
    transport = null;
  }

  public void close() {
    cancelRequested.set(true);
    if (running && transport != null) {
      try { transport.emergencyStop(); } catch (Exception ignored) {}
    }
    try { closeTransport(); } catch (Exception ignored) {}
    jobs.shutdownNow();
  }
}
