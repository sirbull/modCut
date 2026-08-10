package no.horten.modcut;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fazecast.jSerialComm.SerialPort;
import de.thomas_oster.liblasercut.LaserJob;
import de.thomas_oster.liblasercut.LaserCutter;
import de.thomas_oster.liblasercut.ProgressListener;
import de.thomas_oster.liblasercut.drivers.Grbl;
import java.io.IOException;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class MachineController implements AutoCloseable {
  private final ObjectMapper json;
  private final ExecutorService jobs = Executors.newSingleThreadExecutor(r -> {
    Thread thread = new Thread(r, "modcut-laser-job");
    thread.setDaemon(true);
    return thread;
  });
  private final AtomicBoolean cancelRequested = new AtomicBoolean();
  private volatile GrblTransport transport;
  private volatile LaserCutter epilog;
  private volatile DriverCatalog.Descriptor connectedDescriptor = DriverCatalog.DUMMY;
  private volatile String connectedDriver = "";
  private volatile String connectionTarget = "";
  private volatile String connectionIdentity = "";
  private volatile String connectedMachineId = "";
  private volatile String connectedMachineName = "";
  private volatile double connectedBedWidth = 600;
  private volatile double connectedBedHeight = 400;
  private volatile double connectedMaxFeed = 12_000;
  private volatile boolean connectedZEnabled;
  private volatile double connectedZMin;
  private volatile double connectedZMax;
  private volatile double connectedZFeed = 300;
  private volatile double connectedZGlobalOffset;
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

  private ObjectNode listDrivers() { return DriverCatalog.json(json); }

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
    String machineId = machine.path("id").asText().trim();
    if (machineId.isBlank()) throw new IllegalArgumentException("Maskinprofilen mangler en stabil ID.");
    double machineBedWidth = positiveMachineLimit(machine, "bedW", 600);
    double machineBedHeight = positiveMachineLimit(machine, "bedH", 400);
    double machineMaxFeed = positiveMachineLimit(machine, "maxFeed", 12_000);
    JsonNode zAxis = machine.path("zAxis");
    boolean machineZEnabled = zAxis.path("enabled").asBoolean(false);
    double machineZMin = zAxis.path("min").asDouble(-10);
    double machineZMax = zAxis.path("max").asDouble(10);
    double machineZFeed = zAxis.path("feed").asDouble(300);
    double machineZGlobalOffset = zAxis.path("globalOffset").asDouble(0);
    if (machineZEnabled && (!Double.isFinite(machineZMin) || !Double.isFinite(machineZMax)
        || machineZMin > 0 || machineZMax < 0 || machineZMin >= machineZMax
        || !Double.isFinite(machineZFeed) || machineZFeed <= 0
        || !Double.isFinite(machineZGlobalOffset)
        || machineZGlobalOffset < machineZMin || machineZGlobalOffset > machineZMax)) {
      throw new IllegalArgumentException("Maskinprofilen har ugyldige Z-aksegrenser.");
    }
    if (!machineZEnabled && Math.abs(machineZGlobalOffset) > 0.0001) {
      throw new IllegalArgumentException("Globalt fokusavvik krever aktivert Z-akse.");
    }
    String driver = machine.path("driverId").asText(machine.path("driver").asText("dummy"));
    DriverCatalog.Descriptor descriptor = DriverCatalog.resolve(driver);
    driver = descriptor.id();
    boolean epilogDriver = descriptor.epilog();
    if (epilogDriver && machineZEnabled) {
      throw new IllegalArgumentException("Epilog bruker programvarefokus i jobben, ikke GRBL Z-aksekommandoer.");
    }
    dryRun = params.path("dryRun").asBoolean(true) || driver.equals("dummy");
    JsonNode conn = machine.path("conn");
    String type = conn.path("type").asText("usb");
    int defaultPort = descriptor.defaultPort() == null ? 23 : descriptor.defaultPort();
    String target = type.equals("network")
        ? conn.path("host").asText("?") + ":" + conn.path("port").asInt(defaultPort)
        : conn.path("serial").asText("USB");
    if (dryRun) {
      transport = GrblTransport.dryRun(machine.path("name").asText("maskin") + " · " + target);
      connectionTarget = transport.description();
    } else {
      if (driver.equals("grbl")) {
        transport = type.equals("network")
            ? GrblTransport.network(
                conn.path("host").asText(),
                conn.path("port").asInt(23),
                boundedInt(conn, "connectTimeoutMs", 3_000, 250, 30_000),
                boundedInt(conn, "responseTimeoutMs", 30_000, 1_000, 120_000))
            : GrblTransport.serial(conn.path("serial").asText(), conn.path("baud").asInt(115200));
        connectionTarget = transport.description();
        connectionIdentity = transport.identity();
      } else if (epilogDriver) {
        if (!type.equals("network")) throw new IllegalArgumentException("Epilog-driveren krever Network (Ethernet / Wi-Fi).");
        String host = normalizeNetworkHost(conn.path("host").asText());
        int port = conn.path("port").asInt(515);
        int timeout = boundedInt(conn, "connectTimeoutMs", 3_000, 250, 30_000);
        probeTcpService(host, port, timeout);
        epilog = descriptor.createEpilog(host, port, machineBedWidth, machineBedHeight);
        connectionTarget = "lpd " + host + ":" + port;
        connectionIdentity = descriptor.displayName() + " LPD";
      } else {
        throw new IllegalArgumentException("Driveren støttes ikke for ekte kjøring: " + driver + ".");
      }
    }
    connectedDriver = descriptor.displayName();
    connectedDescriptor = descriptor;
    connectedMachineId = machineId;
    connectedMachineName = machine.path("name").asText("maskin");
    connectedBedWidth = machineBedWidth;
    connectedBedHeight = machineBedHeight;
    connectedMaxFeed = machineMaxFeed;
    connectedZEnabled = machineZEnabled;
    connectedZMin = machineZMin;
    connectedZMax = machineZMax;
    connectedZFeed = machineZFeed;
    connectedZGlobalOffset = machineZGlobalOffset;
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
    requireConnected(params);
    double minX = requiredFinite(params, "minX");
    double minY = requiredFinite(params, "minY");
    double maxX = requiredFinite(params, "maxX");
    double maxY = requiredFinite(params, "maxY");
    double frameFeed = Math.min(connectedMaxFeed, 3_000);
    List<String> frame = List.of(
        "; modCut frame - laser off", "G21", "G90", "M5",
        point("G0", minX, minY), point("G1", maxX, minY) + " F" + Math.round(frameFeed), point("G1", maxX, maxY),
        point("G1", minX, maxY), point("G1", minX, minY), "M5", "G0 X0 Y0");
    GcodeValidator.Report report = GcodeValidator.validate(frame, connectedBedWidth, connectedBedHeight, connectedMaxFeed);
    if (connectedDescriptor.epilog()) {
      var built = EpilogJobBuilder.frame("modcut-frame.prn", minX, minY, maxX, maxY, connectedBedWidth, connectedBedHeight, connectedDescriptor);
      startEpilogAsync("modcut-frame.prn", built);
    } else {
      startGrblAsync("frame", frame);
    }
    ObjectNode out = reportNode(report);
    out.put("started", true);
    out.put("dryRun", dryRun);
    return out;
  }

  private ObjectNode startJob(JsonNode params) {
    requireConnected(params);
    if (!dryRun && !params.path("confirmed").asBoolean(false)) {
      throw new IllegalArgumentException("Ekte kjøring krever eksplisitt sikkerhetsbekreftelse.");
    }
    List<String> lines = lines(params);
    GcodeValidator.Report report = GcodeValidator.validate(lines, connectedBedWidth, connectedBedHeight, connectedMaxFeed,
        connectedZEnabled, connectedZMin, connectedZMax, connectedZFeed);
    if (connectedDescriptor.epilog()) {
      var built = EpilogJobBuilder.build(params, connectedBedWidth, connectedBedHeight, connectedDescriptor);
      startEpilogAsync(params.path("filename").asText("job.prn"), built);
    } else {
      startGrblAsync(params.path("filename").asText("job.gcode"), lines);
    }
    ObjectNode out = reportNode(report);
    out.put("started", true);
    out.put("dryRun", dryRun);
    return out;
  }

  private synchronized void startGrblAsync(String name, List<String> lines) {
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

  private synchronized void startEpilogAsync(String name, EpilogJobBuilder.Built built) {
    if (running) throw new IllegalStateException("En jobb kjører allerede.");
    running = true;
    cancelRequested.set(false);
    linesSent = 0;
    totalLines = 100;
    jobName = name;
    lastError = "";
    lastResult = "running";
    LaserCutter activeEpilog = epilog;
    boolean simulate = dryRun;
    jobs.submit(() -> {
      try {
        if (simulate) {
          linesSent = 100;
        } else {
          if (activeEpilog == null) throw new IllegalStateException("Epilog-tilkoblingen er ikke klar.");
          List<String> warnings = new LinkedList<>();
          ProgressListener progress = new ProgressListener() {
            @Override public void progressChanged(Object source, int percent) {
              linesSent = Math.max(0, Math.min(100, percent));
            }
            @Override public void taskChanged(Object source, String taskName) {}
          };
          activeEpilog.sendJob(built.job(), progress, warnings);
          linesSent = 100;
          if (!warnings.isEmpty()) lastError = String.join(" ", warnings);
        }
        lastResult = "completed";
      } catch (Exception error) {
        lastError = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        lastResult = "failed";
        dropEpilog(activeEpilog);
      } finally {
        running = false;
      }
    });
  }

  private ObjectNode cancelJob() throws IOException {
    if (!running) return status();
    if (connectedDescriptor.epilog()) {
      throw new IllegalStateException("En Epilog LPD-opplasting kan ikke nødstoppes fra modCut. Bruk maskinens fysiske stoppknapp.");
    }
    cancelRequested.set(true);
    transport.emergencyStop();
    lastResult = "cancelling";
    return status();
  }

  ObjectNode status() {
    boolean connected = isConnected();
    ObjectNode out = json.createObjectNode();
    out.put("connected", connected);
    out.put("dryRun", dryRun);
    out.put("running", running);
    out.put("cancelRequested", cancelRequested.get());
    out.put("linesSent", linesSent);
    out.put("totalLines", totalLines);
    out.put("progress", totalLines == 0 ? 0 : Math.min(1, (double) linesSent / totalLines));
    out.put("lastError", lastError);
    out.put("lastResult", lastResult);
    out.put("jobName", jobName);
    out.put("target", connected ? connectionTarget : "");
    out.put("connectionType", connected ? (dryRun ? "dry-run" : epilog != null ? "network-lpd" : transport.connectionType()) : "");
    out.put("deviceIdentity", connected ? connectionIdentity : "");
    out.put("connectedMachineId", connected ? connectedMachineId : "");
    out.put("connectedMachineName", connected ? connectedMachineName : "");
    out.put("connectedDriver", connected ? connectedDriver : "");
    out.put("connectedZEnabled", connected && connectedZEnabled);
    out.put("connectedZGlobalOffset", connected ? connectedZGlobalOffset : 0);
    out.put("canEmergencyStop", connected && !connectedDescriptor.epilog());
    out.put("delivery", connectedDescriptor.epilog() ? "epilog-lpd" : "stream");
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

  private void requireConnected(JsonNode params) {
    if (!isConnected()) throw new IllegalStateException("Koble til maskinen (eller dry-run) først.");
    String requestedMachineId = params.path("machineId").asText().trim();
    if (!connectedMachineId.equals(requestedMachineId)) {
      throw new IllegalStateException("Aktivt prosjekt bruker en annen maskin enn tilkoblingen. Koble fra og koble til riktig maskinprofil.");
    }
  }

  private static double positiveMachineLimit(JsonNode machine, String key, double fallback) {
    double value = machine.path(key).asDouble(fallback);
    if (!Double.isFinite(value) || value <= 0) throw new IllegalArgumentException("Maskinprofilen har ugyldig " + key + ".");
    return value;
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

  private static String normalizeNetworkHost(String value) {
    String host = value == null ? "" : value.trim();
    if (host.regionMatches(true, 0, "tcp://", 0, 6)) host = host.substring(6);
    if (host.isBlank()) throw new IllegalArgumentException("Oppgi vertsnavn eller IP-adresse før tilkobling.");
    if (host.contains(":") || host.contains("/") || host.contains("?") || host.contains("#")) {
      throw new IllegalArgumentException("Oppgi bare Epilog-maskinens IP/vertsnavn; porten skal stå i portfeltet.");
    }
    return host;
  }

  private static void probeTcpService(String host, int port, int timeoutMs) throws IOException {
    if (port < 1 || port > 65_535) throw new IllegalArgumentException("Nettverksport må være mellom 1 og 65535.");
    Socket socket = new Socket();
    String target = host + ":" + port;
    try {
      socket.connect(new InetSocketAddress(host, port), timeoutMs);
    } catch (UnknownHostException error) {
      throw new IOException("Fant ikke '" + host + "' på lokalnettet. Kontroller vertsnavn/IP og nettverk.", error);
    } catch (ConnectException error) {
      throw new IOException("Ingen LPD-tjeneste svarer på " + target + ". Kontroller IP, port 515, strøm og nettverk.", error);
    } catch (SocketTimeoutException error) {
      throw new IOException("Tidsavbrudd mot Epilog på " + target + ". Kontroller IP, brannmur og lokalnett.", error);
    } finally {
      try { socket.close(); } catch (IOException ignored) {}
    }
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
    GrblTransport active = transport;
    transport = null;
    epilog = null;
    clearConnectedMachine();
    if (active != null) active.close();
  }

  private synchronized void dropTransport(GrblTransport failed) {
    if (transport != failed) return;
    transport = null;
    clearConnectedMachine();
    try { failed.close(); } catch (Exception ignored) {}
  }

  private synchronized void dropEpilog(LaserCutter failed) {
    if (epilog != failed) return;
    epilog = null;
    clearConnectedMachine();
  }

  private boolean isConnected() { return transport != null || epilog != null; }

  private void clearConnectedMachine() {
    connectedMachineId = "";
    connectedMachineName = "";
    connectedDriver = "";
    connectedDescriptor = DriverCatalog.DUMMY;
    connectionTarget = "";
    connectionIdentity = "";
    connectedBedWidth = 600;
    connectedBedHeight = 400;
    connectedMaxFeed = 12_000;
    connectedZEnabled = false;
    connectedZMin = 0;
    connectedZMax = 0;
    connectedZFeed = 300;
    connectedZGlobalOffset = 0;
  }

  public void close() {
    cancelRequested.set(true);
    if (running && transport != null && !connectedDescriptor.epilog()) {
      try { transport.emergencyStop(); } catch (Exception ignored) {}
    }
    try { closeTransport(); } catch (Exception ignored) {}
    jobs.shutdownNow();
  }
}
