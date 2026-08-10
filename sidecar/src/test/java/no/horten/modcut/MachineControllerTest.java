package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class MachineControllerTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test
  void completesAJobThroughDryRunTransport() throws Exception {
    try (var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":true,"machine":{"id":"test","name":"Test","driver":"Grbl","bedW":600,"bedH":400,"maxFeed":12000,"conn":{"type":"usb","serial":"test","baud":115200}}}
          """);
      assertTrue(controller.handle("connect", connect).path("connected").asBoolean());
      assertTrue(controller.handle("connect", connect).path("dryRun").asBoolean());

      var job = json.readTree("""
          {"machineId":"test","filename":"test.gcode","bedWidth":600,"bedHeight":400,"maxFeed":12000,"confirmed":false,
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
  void blocksJobsForAProjectThatTargetsAnotherMachine() throws Exception {
    try (var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":true,"machine":{"id":"laser-a","name":"Laser A","driver":"Grbl","bedW":100,"bedH":100,"maxFeed":5000,
           "conn":{"type":"usb","serial":"test","baud":115200}}}
          """);
      var status = controller.handle("connect", connect);
      assertEquals("laser-a", status.path("connectedMachineId").asText());
      assertEquals("Laser A", status.path("connectedMachineName").asText());

      var wrongMachine = json.readTree("""
          {"machineId":"laser-b","filename":"wrong.gcode","confirmed":false,
           "gcodeLines":["G21","G90","M5","G0 X1 Y1","M4 S100","G1 X2 Y2 F1200","M5"]}
          """);
      var mismatch = assertThrows(IllegalStateException.class, () -> controller.handle("startJob", wrongMachine));
      assertTrue(mismatch.getMessage().contains("annen maskin"));

      var wrongLimits = json.readTree("""
          {"machineId":"laser-a","filename":"outside.gcode","bedWidth":1000,"bedHeight":1000,"maxFeed":50000,"confirmed":false,
           "gcodeLines":["G21","G90","M5","G0 X1 Y1","M4 S100","G1 X200 Y2 F1200","M5"]}
          """);
      assertThrows(IllegalArgumentException.class, () -> controller.handle("startJob", wrongLimits));
    }
  }

  @Test
  void exposesOnlyImplementedM1Drivers() throws Exception {
    try (var controller = new MachineController(json)) {
      var result = controller.handle("listDrivers", json.createObjectNode());
      assertEquals("LibLaserCut", result.path("library").asText());
      assertTrue(result.path("drivers").toString().contains("Grbl"));
      assertTrue(result.path("drivers").toString().contains("Epilog Zing"));
      assertFalse(result.path("drivers").toString().contains("Ruida"));
    }
  }

  @Test
  void completesAnEpilogJobInDryRunUsingStructuredSegments() throws Exception {
    try (var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":true,"machine":{"id":"zing","name":"Epilog Zing","driver":"Epilog Zing","bedW":600,"bedH":300,
           "maxFeed":12000,"zAxis":{"enabled":false},"conn":{"type":"network","host":"10.100.100.6","port":515}}}
          """);
      var status = controller.handle("connect", connect);
      assertTrue(status.path("connected").asBoolean());
      assertEquals("Epilog Zing", status.path("connectedDriver").asText());

      var job = json.readTree("""
          {"machineId":"zing","filename":"test.prn","confirmed":false,
           "gcodeLines":["G21","G90","M5","G0 X1 Y1","M4 S100","G1 X2 Y2 F1000","M5"],
           "laserSegments":[{"power":10,"speed":10,"frequency":5000,"focus":-1,
            "points":[{"x":1,"y":1},{"x":2,"y":2}]}]}
          """);
      assertTrue(controller.handle("startJob", job).path("started").asBoolean());
      long deadline = System.currentTimeMillis() + 2_000;
      while (controller.status().path("running").asBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(5);
      assertEquals("completed", controller.status().path("lastResult").asText());
      assertEquals("epilog-lpd", controller.status().path("delivery").asText());
    }
  }

  @Test
  void completesHelixVectorAndFrameJobsInDryRun() throws Exception {
    try (var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":true,"machine":{"id":"helix","name":"Epilog Helix","driverId":"epilog-helix","bedW":600,"bedH":300,
           "maxFeed":12000,"zAxis":{"enabled":false},"conn":{"type":"network","host":"192.0.2.1","port":515}}}
          """);
      assertEquals("Epilog Helix", controller.handle("connect", connect).path("connectedDriver").asText());
      var frame = json.readTree("{\"machineId\":\"helix\",\"minX\":1,\"minY\":1,\"maxX\":20,\"maxY\":20}");
      assertTrue(controller.handle("frameJob", frame).path("started").asBoolean());
      long deadline = System.currentTimeMillis() + 2000;
      while (controller.status().path("running").asBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(5);
      var job = json.readTree("""
          {"machineId":"helix","filename":"helix.prn","confirmed":false,
           "gcodeLines":["G21","G90","M5","G0 X1 Y1","G1 X2 Y2 F1000"],
           "laserSegments":[{"operation":"Cut","power":10,"speed":10,"frequency":500,"focus":0,
            "points":[{"x":1,"y":1},{"x":2,"y":2}]}]}
          """);
      assertTrue(controller.handle("startJob", job).path("started").asBoolean());
    }
  }

  @Test
  void validatesZAgainstTheConnectedMachineSnapshot() throws Exception {
    try (var controller = new MachineController(json)) {
      var connect = json.readTree("""
          {"dryRun":true,"machine":{"id":"laser-z","name":"Laser Z","driver":"Grbl","bedW":100,"bedH":100,"maxFeed":5000,
           "zAxis":{"enabled":true,"min":-3,"max":2,"feed":250,"globalOffset":0.25},"conn":{"type":"usb","serial":"test","baud":115200}}}
          """);
      var status = controller.handle("connect", connect);
      assertTrue(status.path("connectedZEnabled").asBoolean());
      assertEquals(0.25, status.path("connectedZGlobalOffset").asDouble());

      var safe = json.readTree("""
          {"machineId":"laser-z","filename":"z.gcode","confirmed":false,
           "gcodeLines":["G21","G90","M5","G1 Z-1 F200","G0 X1 Y1","M4 S100","G1 X2 Y2 F1000","M5","G1 Z0 F200"]}
          """);
      assertTrue(controller.handle("startJob", safe).path("started").asBoolean());

      long deadline = System.currentTimeMillis() + 2_000;
      while (controller.status().path("running").asBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(5);
      var unsafe = json.readTree("""
          {"machineId":"laser-z","filename":"bad-z.gcode","confirmed":false,
           "gcodeLines":["G21","G90","M5","G1 Z-4 F200","G0 X1 Y1"]}
          """);
      assertThrows(IllegalArgumentException.class, () -> controller.handle("startJob", unsafe));
    }
  }

  @Test
  void rejectsInvalidMachineWideFocusCalibration() throws Exception {
    try (var controller = new MachineController(json)) {
      var outsideRange = json.readTree("""
          {"dryRun":true,"machine":{"id":"bad-z","name":"Bad Z","driver":"Grbl","bedW":100,"bedH":100,"maxFeed":5000,
           "zAxis":{"enabled":true,"min":-2,"max":2,"feed":250,"globalOffset":3},"conn":{"type":"usb","serial":"test","baud":115200}}}
          """);
      assertThrows(IllegalArgumentException.class, () -> controller.handle("connect", outsideRange));

      var disabled = json.readTree("""
          {"dryRun":true,"machine":{"id":"disabled-z","name":"Disabled Z","driver":"Grbl","bedW":100,"bedH":100,"maxFeed":5000,
           "zAxis":{"enabled":false,"globalOffset":0.5},"conn":{"type":"usb","serial":"test","baud":115200}}}
          """);
      assertThrows(IllegalArgumentException.class, () -> controller.handle("connect", disabled));
    }
  }
}
