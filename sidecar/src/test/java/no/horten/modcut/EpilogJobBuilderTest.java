package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.thomas_oster.liblasercut.VectorCommand;
import de.thomas_oster.liblasercut.VectorPart;
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
}
