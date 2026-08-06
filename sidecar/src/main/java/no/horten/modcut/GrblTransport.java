package no.horten.modcut;

import com.fazecast.jSerialComm.SerialPort;
import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

interface GrblTransport extends Closeable {
  void sendLine(String line) throws IOException;
  void emergencyStop() throws IOException;
  String description();
  String connectionType();
  String identity();

  static GrblTransport dryRun(String target) { return new DryRun(target); }

  static GrblTransport serial(String portName, int baud) throws IOException {
    if (portName == null || portName.isBlank()) throw new IllegalArgumentException("Velg en seriellport før tilkobling.");
    SerialPort port = SerialPort.getCommPort(portName);
    port.setComPortParameters(baud, 8, SerialPort.ONE_STOP_BIT, SerialPort.NO_PARITY);
    port.setComPortTimeouts(SerialPort.TIMEOUT_READ_SEMI_BLOCKING, 30_000, 3_000);
    if (!port.openPort()) throw new IOException("Kunne ikke åpne seriellport " + portName + ".");
    try {
      return new StreamTransport(port.getInputStream(), port.getOutputStream(), "serial " + portName + " @ " + baud, "serial", port::closePort);
    } catch (RuntimeException error) {
      port.closePort();
      throw error;
    }
  }

  static GrblTransport network(String host, int port, int connectTimeoutMs, int responseTimeoutMs) throws IOException {
    host = normalizeHost(host);
    if (host.isBlank()) throw new IllegalArgumentException("Oppgi vertsnavn eller IP-adresse før tilkobling.");
    if (port < 1 || port > 65_535) throw new IllegalArgumentException("Nettverksport må være mellom 1 og 65535.");
    if (connectTimeoutMs < 250 || connectTimeoutMs > 30_000) {
      throw new IllegalArgumentException("Tilkoblingstidsavbrudd må være mellom 250 og 30000 ms.");
    }
    if (responseTimeoutMs < 1_000 || responseTimeoutMs > 120_000) {
      throw new IllegalArgumentException("Svartidsavbrudd må være mellom 1000 og 120000 ms.");
    }

    Socket socket = new Socket();
    String target = host + ":" + port;
    boolean tcpConnected = false;
    try {
      socket.connect(new InetSocketAddress(host, port), connectTimeoutMs);
      tcpConnected = true;
      socket.setKeepAlive(true);
      socket.setTcpNoDelay(true);
      socket.setSoTimeout(Math.max(250, connectTimeoutMs));
      var transport = new StreamTransport(
          socket.getInputStream(), socket.getOutputStream(), "tcp " + target, "network", socket::close);
      transport.verifyGrbl();
      socket.setSoTimeout(responseTimeoutMs);
      return transport;
    } catch (UnknownHostException error) {
      closeQuietly(socket);
      throw new IOException("Fant ikke '" + host + "' på lokalnettet. Kontroller vertsnavn/IP og nettverk.", error);
    } catch (ConnectException error) {
      closeQuietly(socket);
      throw new IOException("Ingen TCP-tjeneste svarer på " + target + ". Kontroller IP, port, strøm og at maskinene er på samme nettverk.", error);
    } catch (SocketTimeoutException error) {
      closeQuietly(socket);
      throw new IOException("Tidsavbrudd mot " + target + ". Kontroller IP, port, brannmur og lokalnett.", error);
    } catch (IOException | RuntimeException error) {
      closeQuietly(socket);
      if (tcpConnected && error instanceof IOException) {
        throw new IOException("TCP-porten på " + target + " kunne ikke verifiseres som GRBL: " + error.getMessage(), error);
      }
      throw error;
    }
  }

  private static String normalizeHost(String host) {
    if (host == null) return "";
    String normalized = host.trim();
    if (normalized.regionMatches(true, 0, "tcp://", 0, 6)) normalized = normalized.substring(6);
    if (normalized.startsWith("[") && normalized.endsWith("]")) normalized = normalized.substring(1, normalized.length() - 1);
    if (normalized.contains("/") || normalized.contains("?") || normalized.contains("#")) {
      throw new IllegalArgumentException("Oppgi bare vertsnavn/IP; ikke en URL eller filsti.");
    }
    return normalized;
  }

  private static void closeQuietly(Socket socket) {
    try { socket.close(); } catch (IOException ignored) {}
  }

  final class DryRun implements GrblTransport {
    private final String target;
    private DryRun(String target) { this.target = target; }
    public void sendLine(String line) {}
    public void emergencyStop() {}
    public String description() { return "dry-run · " + target; }
    public String connectionType() { return "dry-run"; }
    public String identity() { return ""; }
    public void close() {}
  }

  final class StreamTransport implements GrblTransport {
    private final BufferedReader input;
    private final OutputStream output;
    private final String description;
    private final String connectionType;
    private final Closeable closer;
    private String identity = "";

    private StreamTransport(java.io.InputStream input, OutputStream output, String description, String connectionType, Closeable closer) {
      this.input = new BufferedReader(new InputStreamReader(input, StandardCharsets.US_ASCII));
      this.output = output;
      this.description = description;
      this.connectionType = connectionType;
      this.closer = closer;
    }

    private synchronized void verifyGrbl() throws IOException {
      // VisiCut verifies the device after opening the socket. A real-time GRBL
      // status query is non-moving and avoids claiming that any open TCP port
      // is a laser. It also works with common serial-to-Wi-Fi bridges.
      output.write('?');
      output.flush();
      String banner = "";
      try {
        while (true) {
          String line = input.readLine();
          if (line == null) throw new IOException("TCP-tjenesten lukket forbindelsen før GRBL svarte.");
          String clean = cleanResponse(line);
          String lower = clean.toLowerCase(Locale.ROOT);
          int statusStart = clean.indexOf('<');
          int statusEnd = clean.indexOf('>', statusStart + 1);
          if (statusStart >= 0 && statusEnd > statusStart) {
            identity = clean.substring(statusStart, statusEnd + 1);
            return;
          }
          if (lower.contains("grbl") || lower.contains("fluidnc")) banner = clean;
        }
      } catch (SocketTimeoutException timeout) {
        if (!banner.isBlank()) {
          identity = banner;
          return;
        }
        throw new IOException("TCP-porten svarte, men sendte ingen gyldig GRBL-status. Kontroller at dette er laserens rå GRBL/Telnet-port.", timeout);
      }
    }

    private static String cleanResponse(String response) {
      // Telnet bridges may prefix negotiation/control bytes. Keep printable
      // ASCII so GRBL banners and <State|...> status frames can be recognized.
      return response.replaceAll("[^\\x20-\\x7E]", "").trim();
    }

    public synchronized void sendLine(String line) throws IOException {
      output.write((line + "\r\n").getBytes(StandardCharsets.US_ASCII));
      output.flush();
      while (true) {
        String response = input.readLine();
        if (response == null) throw new IOException("GRBL lukket tilkoblingen.");
        String normalized = response.trim().toLowerCase(Locale.ROOT);
        if (normalized.equals("ok")) return;
        if (normalized.startsWith("error") || normalized.startsWith("alarm")) {
          throw new IOException("GRBL avviste kommandoen: " + response.trim());
        }
      }
    }

    public void emergencyStop() throws IOException {
      output.write('!');       // feed hold
      output.write(0x18);      // GRBL soft reset: stops motion and disables laser output
      output.flush();
    }

    public String description() { return description; }
    public String connectionType() { return connectionType; }
    public String identity() { return identity; }
    public void close() throws IOException { closer.close(); }
  }
}
