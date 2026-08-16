package no.horten.modcut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.thomas_oster.liblasercut.VectorCommand;
import de.thomas_oster.liblasercut.VectorPart;
import de.thomas_oster.liblasercut.RasterPart;
import de.thomas_oster.liblasercut.Raster3dPart;
import de.thomas_oster.liblasercut.drivers.EpilogEngraveProperty;
import de.thomas_oster.liblasercut.drivers.EpilogZing;
import de.thomas_oster.liblasercut.drivers.EpilogHelix;
import de.thomas_oster.liblasercut.platform.Util;
import de.thomas_oster.liblasercut.properties.PowerSpeedFocusFrequencyProperty;
import org.junit.jupiter.api.Test;

class EpilogJobBuilderTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test
  void usesTheHelixDriverAndItsOwnVectorAndRasterResolutions() throws Exception {
    assertTrue(DriverCatalog.HELIX.createEpilog("localhost", 515, 100, 100) instanceof EpilogHelix);
    assertTrue(DriverCatalog.ZING.createEpilog("localhost", 515, 100, 100) instanceof EpilogZing);
    var vector = json.readTree("""
        {"laserSegments":[{"operation":"Score","power":10,"speed":20,"frequency":500,"focus":0,
        "points":[{"x":1,"y":1},{"x":2,"y":2}]}]}
        """);
    var built = EpilogJobBuilder.build(vector, 100, 100, DriverCatalog.HELIX);
    assertEquals(600, built.job().getParts().get(0).getDPI());
    assertTrue(EpilogJobBuilder.frame("frame.prn", 1, 1, 2, 2, 100, 100, DriverCatalog.HELIX).job().getParts().get(0) instanceof VectorPart);

    var invalidRaster = json.readTree("""
        {"laserSegments":[{"operation":"Engrave","raster":true,"engraveMode":"native","dpi":500,
        "dither":"Jarvis","power":10,"maxPower":10,"speed":20,"frequency":500,"focus":0,
        "points":[{"x":1,"y":1},{"x":2,"y":1}]}]}
        """);
    assertThrows(IllegalArgumentException.class, () -> EpilogJobBuilder.build(invalidRaster, 100, 100, DriverCatalog.HELIX));
  }

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

  @Test
  void combinesRasterRunsFromOneLayerIntoNativeEpilogRaster() throws Exception {
    var params = json.readTree("""
        {"filename":"native-raster.prn","laserSegments":[
          {"layerIndex":0,"operation":"Engrave","raster":true,"engraveMode":"auto",
           "dpi":100,"dither":"Jarvis","bottomUp":true,"maxPower":40,
           "power":40,"speed":70,"frequency":500,"focus":-0.5,
           "points":[{"x":10,"y":20},{"x":12.54,"y":20}]},
          {"layerIndex":0,"operation":"Engrave","raster":true,"engraveMode":"auto",
           "dpi":100,"dither":"Jarvis","bottomUp":true,"maxPower":40,
           "power":40,"speed":70,"frequency":500,"focus":-0.5,
           "points":[{"x":10,"y":22.54},{"x":12.54,"y":22.54}]}
        ]}
        """);

    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(1, built.job().getParts().size());
    var raster = (RasterPart) built.job().getParts().get(0);
    assertEquals(11, raster.getRasterWidth());
    assertEquals(11, raster.getRasterHeight());
    assertTrue(raster.isBlack(0, 0));
    assertTrue(raster.isBlack(10, 10));
    var property = (EpilogEngraveProperty) raster.getLaserProperty();
    assertEquals(40, property.getPower());
    assertEquals(70, property.getSpeed());
    assertEquals(-0.5, property.getFocus());
    assertTrue(property.isEngraveBottomUp());
  }

  @Test
  void expandsCompactGrayscaleRowsInsideTheNativeRasterBuilder() throws Exception {
    var params = json.readTree("""
        {"filename":"compact-photo.prn","laserSegments":[
          {"layerIndex":0,"operation":"Engrave","raster":true,"rasterRow":true,"engraveMode":"native",
           "dpi":100,"dither":"Grayscale","bottomUp":true,"maxPower":40,
           "power":20,"speed":70,"frequency":500,"focus":0,
           "points":[{"x":10,"y":20},{"x":12.54,"y":20}],
           "samples":"gP8="}
        ]}
        """);

    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(1, built.segmentCount(), "one compact transport segment must represent the complete row");
    assertTrue(built.job().getParts().get(0) instanceof Raster3dPart);
    var raster = (Raster3dPart) built.job().getParts().get(0);
    assertEquals(11, raster.getRasterWidth());
    assertEquals(1, raster.getRasterHeight());
    var row = new java.util.ArrayList<Byte>();
    raster.getRasterLine(0, row);
    assertTrue(new java.util.HashSet<>(row).size() > 1, "both grayscale powers must survive row expansion");
  }

  @Test
  void vectorScanModeKeepsRasterRunsAsVectors() throws Exception {
    var params = json.readTree("""
        {"laserSegments":[
          {"layerIndex":0,"operation":"Engrave","raster":true,"engraveMode":"vector",
           "dpi":500,"dither":"Jarvis","bottomUp":true,"maxPower":30,
           "power":30,"speed":50,"frequency":500,"focus":0,
           "points":[{"x":1,"y":1},{"x":2,"y":1}]}
        ]}
        """);
    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(1, built.job().getParts().size());
    assertTrue(built.job().getParts().get(0) instanceof VectorPart);
  }

  @Test
  void keepsLayerPartsTogetherAroundNativeRaster() throws Exception {
    var params = json.readTree("""
        {"laserSegments":[
          {"layerIndex":0,"operation":"Score","power":10,"speed":50,"frequency":500,"focus":0,
           "points":[{"x":1,"y":1},{"x":2,"y":1}]},
          {"layerIndex":1,"operation":"Engrave","raster":true,"engraveMode":"native",
           "dpi":500,"dither":"Jarvis","bottomUp":false,"maxPower":30,
           "power":30,"speed":50,"frequency":500,"focus":0,
           "points":[{"x":1,"y":2},{"x":2,"y":2}]},
          {"layerIndex":2,"operation":"Cut","power":100,"speed":20,"frequency":500,"focus":0,
           "points":[{"x":1,"y":3},{"x":2,"y":3}]}
        ]}
        """);
    var built = EpilogJobBuilder.build(params, 100, 100);
    assertEquals(3, built.job().getParts().size());
    assertTrue(built.job().getParts().get(0) instanceof VectorPart);
    assertTrue(built.job().getParts().get(1) instanceof RasterPart);
    assertTrue(built.job().getParts().get(2) instanceof VectorPart);
  }

  @Test
  void nativeRasterSerializesThroughTheRealEpilogDriver() throws Exception {
    var params = json.readTree("""
        {"filename":"native-output.prn","laserSegments":[
          {"layerIndex":0,"operation":"Engrave","raster":true,"engraveMode":"native",
           "dpi":500,"dither":"Jarvis","bottomUp":true,"maxPower":25,
           "power":25,"speed":80,"frequency":500,"focus":0,
           "points":[{"x":5,"y":5},{"x":8,"y":5}]}
        ]}
        """);
    var built = EpilogJobBuilder.build(params, 100, 100);
    var bytes = new java.io.ByteArrayOutputStream();
    new EpilogZing().saveJob(bytes, built.job());
    assertTrue(bytes.size() > 100);
  }
}
