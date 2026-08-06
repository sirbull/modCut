package no.horten.modcut;

import com.fazecast.jSerialComm.SerialPort;
import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

interface GrblTransport extends Closeable {
  void sendLine(String line) throws IOException;
  void emergencyStop() throws IOException;
  String description();

  static GrblTransport dryRun(String target) { return new DryRun(target); }

  static GrblTransport serial(String portName, int baud) throws IOException {
    if (portName == null || portName.isBlank()) throw new IllegalArgumentException("Velg en seriellport før tilkobling.");
    SerialPort port = SerialPort.getCommPort(portName);
    port.setComPortParameters(baud, 8, SerialPort.ONE_STOP_BIT, SerialPort.NO_PARITY);
    port.setComPortTimeouts(SerialPort.TIMEOUT_READ_SEMI_BLOCKING, 30_000, 3_000);
    if (!port.openPort()) throw new IOException("Kunne ikke åpne seriellport " + portName + ".");
    try {
      return new StreamTransport(port.getInputStream(), port.getOutputStream(), "serial " + portName + " @ " + baud, port::closePort);
    } catch (RuntimeException error) {
      port.closePort();
      throw error;
    }
  }

  static GrblTransport network(String host, int port) throws IOException {
    if (host == null || host.isBlank()) throw new IllegalArgumentException("Oppgi vertsnavn/IP før tilkobling.");
    Socket socket = new Socket();
    socket.connect(new InetSocketAddress(host, port), 3_000);
    socket.setSoTimeout(30_000);
    return new StreamTransport(socket.getInputStream(), socket.getOutputStream(), "tcp " + host + ":" + port, socket::close);
  }

  final class DryRun implements GrblTransport {
    private final String target;
    private DryRun(String target) { this.target = target; }
    public void sendLine(String line) {}
    public void emergencyStop() {}
    public String description() { return "dry-run · " + target; }
    public void close() {}
  }

  final class StreamTransport implements GrblTransport {
    private final BufferedReader input;
    private final OutputStream output;
    private final String description;
    private final Closeable closer;

    private StreamTransport(java.io.InputStream input, OutputStream output, String description, Closeable closer) {
      this.input = new BufferedReader(new InputStreamReader(input, StandardCharsets.US_ASCII));
      this.output = output;
      this.description = description;
      this.closer = closer;
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
    public void close() throws IOException { closer.close(); }
  }
}
