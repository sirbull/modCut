package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.thomas_oster.liblasercut.VectorCommand;
import de.thomas_oster.liblasercut.VectorPart;
import de.thomas_oster.liblasercut.platform.Util;
import de.thomas_oster.liblasercut.properties.PowerSpeedFocusFrequencyProperty;
import org.junit.jupiter.api.Test;

class EpilogJobBuilderTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test
  void buildsBoundedLibLaserCutVectorJobWithSoftwareFocus() throws Exception {
    var params = json.readTree("""
        {"filename":"test.prn","laserSegments":[
          {"power":42,"speed":17,"frequency":20000,"focus":-1.25,
           "points":[{"x":10,"y":20},{"x":30,"y":40},{"x":50,"y":20}]}
        ]}
        """);
    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(1, built.segmentCount());
    assertEquals(3, built.pointCount());
    assertTrue(built.frequencyClamped());
    assertEquals(1, built.job().getParts().size());

    var commands = ((VectorPart) built.job().getParts().get(0)).getCommandList();
    var property = (PowerSpeedFocusFrequencyProperty) commands[1].getProperty();
    assertEquals(VectorCommand.CmdType.SETPROPERTY, commands[1].getType());
    assertEquals(42, property.getPower());
    assertEquals(17, property.getSpeed());
    assertEquals(5000, property.getFrequency());
    assertEquals(-1.25, property.getFocus());
  }

  @Test
  void rejectsCoordinatesAndFocusOutsideTheMachineEnvelope() throws Exception {
    var outsideBed = json.readTree("""
        {"laserSegments":[{"power":10,"speed":10,"frequency":5000,"focus":0,
         "points":[{"x":0,"y":0},{"x":101,"y":1}]}]}
        """);
    assertThrows(IllegalArgumentException.class, () -> EpilogJobBuilder.build(outsideBed, 100, 100));

    var outsideFocus = json.readTree("""
        {"laserSegments":[{"power":10,"speed":10,"frequency":5000,"focus":13,
         "points":[{"x":0,"y":0},{"x":1,"y":1}]}]}
        """);
    assertThrows(IllegalArgumentException.class, () -> EpilogJobBuilder.build(outsideFocus, 100, 100));
  }

  @Test
  void removesQuantizedDuplicateClosureAndAddsAControlledOverlap() throws Exception {
    var params = json.readTree("""
        {"filename":"closed.prn","laserSegments":[
          {"power":30,"speed":20,"frequency":1000,"focus":0,"operation":"Cut","closed":true,
           "points":[{"x":10,"y":10},{"x":10,"y":9.8},{"x":10,"y":10.001},{"x":10,"y":10}],
           "overlapPoint":{"x":10,"y":9.9}}
        ]}
        """);
    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(4, built.pointCount());

    var commands = ((VectorPart) built.job().getParts().get(0)).getCommandList();
    var moves = java.util.Arrays.stream(commands)
        .filter(command -> command.getType() == VectorCommand.CmdType.MOVETO || command.getType() == VectorCommand.CmdType.LINETO)
        .toList();
    assertEquals(4, moves.size());
    int startX = (int) Util.mm2px(10, EpilogJobBuilder.DPI);
    int startY = (int) Util.mm2px(10, EpilogJobBuilder.DPI);
    int overlapY = (int) Util.mm2px(9.9, EpilogJobBuilder.DPI);
    assertEquals(startX, moves.get(2).getX());
    assertEquals(startY, moves.get(2).getY());
    assertEquals(startX, moves.get(3).getX());
    assertEquals(overlapY, moves.get(3).getY());
  }

  @Test
  void closesScoreExactlyOnceWithoutCutOverlap() throws Exception {
    var params = json.readTree("""
        {"filename":"score.prn","laserSegments":[
          {"power":20,"speed":30,"frequency":1000,"focus":0,"operation":"Score","closed":true,
           "points":[{"x":10,"y":10},{"x":10,"y":9.8},{"x":10,"y":10.001},{"x":10,"y":10}],
           "overlapPoint":{"x":10,"y":9.9}}
        ]}
        """);
    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(3, built.pointCount());

    var moves = java.util.Arrays.stream(((VectorPart) built.job().getParts().get(0)).getCommandList())
        .filter(command -> command.getType() == VectorCommand.CmdType.MOVETO || command.getType() == VectorCommand.CmdType.LINETO)
        .toList();
    assertEquals(3, moves.size());
    assertEquals(moves.get(0).getX(), moves.get(2).getX());
    assertEquals(moves.get(0).getY(), moves.get(2).getY());
  }
}
