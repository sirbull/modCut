package no.horten.modcut;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import de.thomas_oster.liblasercut.LaserCutter;
import de.thomas_oster.liblasercut.drivers.EpilogHelix;
import de.thomas_oster.liblasercut.drivers.EpilogZing;
import java.util.List;

/** Single authoritative sidecar allow-list. Only entries with a complete execution path belong here. */
final class DriverCatalog {
  record Descriptor(String id, String displayName, String manufacturer, String family, String protocol,
      List<String> connectionTypes, Integer defaultPort, String fileExtension, List<Integer> rasterDpis,
      int vectorDpi, boolean nativeRaster, boolean softwareFocus, boolean controlledZ, boolean framing,
      boolean softwareCancel, double focusMinMm, double focusMaxMm) {
    boolean epilog() { return id.startsWith("epilog-"); }
    LaserCutter createEpilog(String host, int port, double bedWidth, double bedHeight) {
      LaserCutter cutter = switch (id) {
        case "epilog-zing" -> new EpilogZing(host);
        case "epilog-helix" -> new EpilogHelix(host);
        default -> throw new IllegalStateException("Ikke en Epilog-driver: " + id);
      };
      if (cutter instanceof EpilogZing value) { value.setPort(port); value.setBedWidth(bedWidth); value.setBedHeight(bedHeight); value.setAutoFocus(false); value.setHideSoftwareFocus(false); }
      if (cutter instanceof EpilogHelix value) { value.setPort(port); value.setBedWidth(bedWidth); value.setBedHeight(bedHeight); value.setAutoFocus(false); value.setHideSoftwareFocus(false); }
      return cutter;
    }
  }
  static final Descriptor DUMMY = new Descriptor("dummy", "Dummy", "Generic", "Simulation", "none", List.of("usb"), null, ".gcode", List.of(), 300, false, false, true, true, true, 0, 0);
  static final Descriptor GRBL = new Descriptor("grbl", "GRBL", "Generic", "GRBL", "GRBL serial/TCP", List.of("usb", "network"), 23, ".gcode", List.of(), 300, false, false, true, true, true, 0, 0);
  static final Descriptor ZING = new Descriptor("epilog-zing", "Epilog Zing", "Epilog", "Zing", "LPD/PJL/PCL/HPGL", List.of("network"), 515, ".prn", List.of(100,200,250,400,500,1000), 500, true, true, false, true, false, -12.6, 12.6);
  static final Descriptor HELIX = new Descriptor("epilog-helix", "Epilog Helix", "Epilog", "Helix", "LPD/PJL/PCL/HPGL", List.of("network"), 515, ".prn", List.of(75,150,200,300,400,600,1200), 600, true, true, false, true, false, -12.6, 12.6);
  static final List<Descriptor> ALL = List.of(DUMMY, GRBL, ZING, HELIX);
  static Descriptor resolve(String value) {
    String key = value == null ? "" : value.trim().toLowerCase();
    key = switch (key) { case "dummy" -> "dummy"; case "grbl" -> "grbl"; case "epilog zing" -> "epilog-zing"; case "epilog helix" -> "epilog-helix"; default -> key; };
    String id = key;
    return ALL.stream().filter(d -> d.id().equals(id)).findFirst().orElseThrow(() -> new IllegalArgumentException("Driveren støttes ikke: " + value + "."));
  }
  static ObjectNode json(ObjectMapper mapper) {
    ObjectNode out = mapper.createObjectNode(); ArrayNode drivers = out.putArray("drivers");
    for (Descriptor d : ALL) { ObjectNode n=drivers.addObject(); n.put("id",d.id()); if (d.id().equals("grbl")) n.put("legacyName", "Grbl"); n.put("displayName",d.displayName()); n.put("manufacturer",d.manufacturer()); n.put("family",d.family()); n.put("protocol",d.protocol()); n.putPOJO("connectionTypes",d.connectionTypes()); if(d.defaultPort()!=null)n.put("defaultPort",d.defaultPort()); n.put("fileExtension",d.fileExtension()); n.putPOJO("rasterDpis",d.rasterDpis()); n.put("vectorDpi",d.vectorDpi()); n.put("nativeRaster",d.nativeRaster()); n.put("softwareFocus",d.softwareFocus()); n.put("controlledZ",d.controlledZ()); n.put("framing",d.framing()); n.put("softwareCancel",d.softwareCancel()); }
    out.put("library","LibLaserCut"); return out;
  }
  private DriverCatalog() {}
}
