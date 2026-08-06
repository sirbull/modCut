package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class MachineControllerTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test
  void completesAJobThroughDryRunTransport() throws Exception {
    try (var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":true,"machine":{"name":"Test","driver":"Grbl","conn":{"type":"usb","serial":"test","baud":115200}}}
          """);
      assertTrue(controller.handle("connect", connect).path("connected").asBoolean());
      assertTrue(controller.handle("connect", connect).path("dryRun").asBoolean());

      var job = json.readTree("""
          {"filename":"test.gcode","bedWidth":600,"bedHeight":400,"maxFeed":12000,"confirmed":false,
           "ops":[{"op":"Cut"}],"gcodeLines":["G21","G90","M5","G0 X1 Y1","M4 S500","G1 X2 Y2 F1200","M5"]}
          """);
      var result = controller.handle("startJob", job);
      assertTrue(result.path("started").asBoolean());
      assertTrue(result.path("dryRun").asBoolean());

      long deadline = System.currentTimeMillis() + 2_000;
      while (controller.status().path("running").asBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(5);
      assertFalse(controller.status().path("running").asBoolean());
      assertEquals("completed", controller.status().path("lastResult").asText());
    }
  }

  @Test
  void exposesOnlyImplementedM1Drivers() throws Exception {
    try (var controller = new MachineController(json)) {
      var result = controller.handle("listDrivers", json.createObjectNode());
      assertEquals("LibLaserCut", result.path("library").asText());
      assertTrue(result.path("drivers").toString().contains("Grbl"));
      assertFalse(result.path("drivers").toString().contains("Ruida"));
    }
  }
}
