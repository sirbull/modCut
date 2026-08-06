package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class NetworkConnectionTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test
  void verifiesGrblAndCompletesAJobOverLocalTcp() throws Exception {
    try (var laser = new FakeGrblServer(); var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":false,"machine":{"id":"lan","name":"LAN laser","driver":"Grbl","bedW":600,"bedH":400,"maxFeed":12000,"conn":{
            "type":"network","host":"127.0.0.1","port":%d,
            "connectTimeoutMs":1000,"responseTimeoutMs":2000}}}
          """.formatted(laser.port()));

      var connected = controller.handle("connect", connect);
      assertTrue(connected.path("connected").asBoolean());
      assertFalse(connected.path("dryRun").asBoolean());
      assertEquals("network", connected.path("connectionType").asText());
      assertTrue(connected.path("deviceIdentity").asText().startsWith("<Idle|"));

      var job = json.readTree("""
          {"machineId":"lan","filename":"network-test.gcode","bedWidth":600,"bedHeight":400,"maxFeed":12000,"confirmed":true,
           "ops":[{"op":"Cut"}],"gcodeLines":["G21","G90","M5","G0 X1 Y1","M4 S100","G1 X2 Y2 F1200","M5"]}
          """);
      assertTrue(controller.handle("startJob", job).path("started").asBoolean());

      long deadline = System.currentTimeMillis() + 2_000;
      while (controller.status().path("running").asBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(5);
      assertEquals("completed", controller.status().path("lastResult").asText());
      assertTrue(controller.status().path("connected").asBoolean());
      assertTrue(laser.lines().contains("G1 X2 Y2 F1200"));
    }
  }

  @Test
  void rejectsAnOpenPortThatIsNotGrbl() throws Exception {
    try (var service = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
         var controller = new MachineController(json)) {
      Thread responder = new Thread(() -> {
        try (Socket client = service.accept()) {
          client.getOutputStream().write("HTTP/1.1 200 OK\r\n".getBytes(StandardCharsets.US_ASCII));
          client.getOutputStream().flush();
        } catch (IOException ignored) {}
      });
      responder.setDaemon(true);
      responder.start();

      var connect = json.readTree("""
          {"dryRun":false,"machine":{"id":"wrong","name":"Wrong service","driver":"Grbl","bedW":600,"bedH":400,"maxFeed":12000,"conn":{
            "type":"network","host":"127.0.0.1","port":%d,
            "connectTimeoutMs":500,"responseTimeoutMs":1000}}}
          """.formatted(service.getLocalPort()));

      IOException error = assertThrows(IOException.class, () -> controller.handle("connect", connect));
      assertTrue(error.getMessage().contains("GRBL"));
      assertFalse(controller.status().path("connected").asBoolean());
      responder.join(1_000);
    }
  }

  private static final class FakeGrblServer implements AutoCloseable {
    private final ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
    private final List<String> received = Collections.synchronizedList(new ArrayList<>());
    private final Thread thread;
    private volatile Socket client;

    FakeGrblServer() throws IOException {
      thread = new Thread(this::serve, "fake-grbl-tcp");
      thread.setDaemon(true);
      thread.start();
    }

    int port() { return server.getLocalPort(); }
    List<String> lines() { return List.copyOf(received); }

    private void serve() {
      try (Socket accepted = server.accept()) {
        client = accepted;
        var input = accepted.getInputStream();
        var output = accepted.getOutputStream();
        var line = new ByteArrayOutputStream();
        int value;
        while ((value = input.read()) >= 0) {
          if (value == '?') {
            output.write("<Idle|MPos:0.000,0.000,0.000|FS:0,0>\r\n".getBytes(StandardCharsets.US_ASCII));
            output.flush();
          } else if (value == '\n') {
            String command = line.toString(StandardCharsets.US_ASCII).replace("\r", "").trim();
            line.reset();
            if (command.isEmpty()) continue;
            received.add(command);
            output.write("ok\r\n".getBytes(StandardCharsets.US_ASCII));
            output.flush();
          } else if (value != '!' && value != 0x18) {
            line.write(value);
          }
        }
      } catch (IOException ignored) {}
    }

    @Override
    public void close() throws Exception {
      if (client != null) client.close();
      server.close();
      thread.join(1_000);
    }
  }
}
