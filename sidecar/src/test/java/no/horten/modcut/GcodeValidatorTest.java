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

  @Test
  void acceptsSeparateLaserOffZOffsetsWithinTheMachineProfile() {
    var report = GcodeValidator.validate(List.of(
        "G21", "G90", "M5", "G1 Z-1.5 F200", "G0 X1 Y1", "M4 S250",
        "G1 X2 Y2 F1200", "M5", "G1 Z0 F200", "G0 X0 Y0"),
        600, 400, 12_000, true, -5, 3, 300);
    assertEquals(5, report.motionCount());
  }

  @Test
  void rejectsZWhenDisabledOutsideRangeOrWhileLaserIsOn() {
    var zJob = List.of("G21", "G90", "M5", "G1 Z-1 F200", "G1 Z0 F200", "G0 X0 Y0");
    assertThrows(IllegalArgumentException.class, () -> GcodeValidator.validate(zJob, 600, 400, 12_000));
    assertThrows(IllegalArgumentException.class, () -> GcodeValidator.validate(
        List.of("G21", "G90", "M5", "G1 Z-6 F200", "G0 X0 Y0"), 600, 400, 12_000, true, -5, 3, 300));
    assertThrows(IllegalArgumentException.class, () -> GcodeValidator.validate(
        List.of("G21", "G90", "M5", "G0 X1 Y1", "M4 S100", "G1 Z-1 F200", "M5", "G1 Z0 F200"),
        600, 400, 12_000, true, -5, 3, 300));
    assertThrows(IllegalArgumentException.class, () -> GcodeValidator.validate(
        List.of("G21", "G90", "M5", "G0 Z-1 F200", "G1 Z0 F200", "G0 X0 Y0"),
        600, 400, 12_000, true, -5, 3, 300));
  }

  @Test
  void requiresZToReturnToFocusedZero() {
    assertThrows(IllegalArgumentException.class, () -> GcodeValidator.validate(
        List.of("G21", "G90", "M5", "G1 Z1 F200", "G0 X0 Y0"),
        600, 400, 12_000, true, -5, 3, 300));
  }
}
