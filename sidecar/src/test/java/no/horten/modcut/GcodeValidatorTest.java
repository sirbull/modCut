package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class GcodeValidatorTest {
  private static final List<String> SAFE_JOB = List.of(
      "; generated", "G21", "G90", "M5", "G0 X10 Y20", "M4 S500",
      "G1 X50 Y20 F1200", "G1 X50 Y40 F1200", "M5", "G0 X0 Y0");

  @Test
  void acceptsTheModCutGrblSubset() {
    var report = GcodeValidator.validate(SAFE_JOB, 600, 400, 12_000);
    assertEquals(4, report.motionCount());
    assertEquals(50, report.maxX());
    assertEquals(40, report.maxY());
    assertEquals(1200, report.maxFeedSeen());
  }

  @Test
  void rejectsCoordinatesOutsideTheBed() {
    var error = assertThrows(IllegalArgumentException.class, () ->
        GcodeValidator.validate(List.of("G21", "G90", "M5", "G0 X601 Y1"), 600, 400, 12_000));
    assertTrue(error.getMessage().contains("utenfor"));
  }

  @Test
  void rejectsExcessiveFeedAndPower() {
    assertThrows(IllegalArgumentException.class, () ->
        GcodeValidator.validate(List.of("G21", "G90", "M5", "G0 X1 Y1", "M4 S1001", "M5"), 600, 400, 12_000));
    assertThrows(IllegalArgumentException.class, () ->
        GcodeValidator.validate(List.of("G21", "G90", "M5", "G1 X1 Y1 F12001"), 600, 400, 12_000));
  }

  @Test
  void rejectsRelativeAndControllerCommands() {
    assertThrows(IllegalArgumentException.class, () ->
        GcodeValidator.validate(List.of("G21", "G91", "G0 X1 Y1"), 600, 400, 12_000));
    assertThrows(IllegalArgumentException.class, () ->
        GcodeValidator.validate(List.of("G21", "G90", "$H", "G0 X1 Y1"), 600, 400, 12_000));
  }

  @Test
  void requiresTheLaserToBeOffAtTheEnd() {
    assertThrows(IllegalArgumentException.class, () ->
        GcodeValidator.validate(List.of("G21", "G90", "G0 X1 Y1", "M4 S500", "G1 X2 Y2"), 600, 400, 12_000));
  }
}
