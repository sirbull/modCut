import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * modCut sidecar — M0 skeleton.
 *
 * Speaks line-delimited JSON-RPC 2.0 over stdio: one request object per line in,
 * one response object per line out. This is the bridge Electron's main process
 * drives. At M1 this becomes a Maven module that depends on LibLaserCut and
 * dispatches to real LaserCutter drivers; for now it answers with a Dummy driver
 * so the whole pipeline can be exercised without hardware or a build tool.
 *
 * ponytail: hand-rolled JSON in/out on purpose — no Jackson/Gson until the Maven
 * build lands with LibLaserCut. Requests here are tiny and flat, so a regex read
 * + templated write is smaller than pulling a dependency. Upgrade path: swap the
 * two helpers below for a real JSON library when buildJob carries real geometry.
 */
public class Sidecar {

    public static void main(String[] args) throws Exception {
        var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        var out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        System.err.println("[modCut sidecar] ready (Dummy driver, Java " + System.getProperty("java.version") + ")");

        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) continue;
            long id = extractLong(line, "id");
            String method = extractString(line, "method");
            try {
                out.println(handle(id, method, line));
            } catch (Exception e) {
                out.println("{\"jsonrpc\":\"2.0\",\"id\":" + id
                        + ",\"error\":{\"code\":-32603,\"message\":\"" + esc(e.getMessage()) + "\"}}");
            }
        }
    }

    private static String handle(long id, String method, String raw) {
        String result = switch (method == null ? "" : method) {
            case "ping" -> "{\"pong\":true,\"driver\":\"Dummy\",\"ready\":true}";
            // Real list will come from LibLaserCut's registered drivers at M1.
            case "listDrivers" -> "{\"drivers\":[\"Dummy\",\"Grbl\",\"Ruida\",\"EpilogZing\",\"EpilogHelix\"]}";
            case "buildJob" -> buildJobStub(raw);
            default -> null;
        };
        if (result == null) {
            return "{\"jsonrpc\":\"2.0\",\"id\":" + id
                    + ",\"error\":{\"code\":-32601,\"message\":\"Method not found: " + esc(method) + "\"}}";
        }
        return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":" + result + "}";
    }

    /** M0 driver stub: accepts renderer-built G-code and reports exactly what would be sent. */
    private static String buildJobStub(String raw) {
        int opCount = raw.split("\"op\"", -1).length - 1;
        List<String> lines = extractStringArray(raw, "gcodeLines");
        if (!lines.isEmpty()) {
            int bytes = 0;
            for (String line : lines) bytes += line.getBytes(StandardCharsets.UTF_8).length + 1;
            List<String> preview = lines.subList(0, Math.min(20, lines.size()));
            return "{\"format\":\"gcode\",\"opCount\":" + opCount
                    + ",\"lineCount\":" + lines.size()
                    + ",\"bytes\":" + bytes
                    + ",\"preview\":" + jsonArray(preview) + "}";
        }
        String gcode = "[\"G21\",\"G90\",\"M4 S800\",\"G1 X10 Y10 F600\",\"G1 X50 Y10\",\"M5\"]";
        return "{\"format\":\"gcode\",\"opCount\":" + opCount
                + ",\"lineCount\":6,\"bytes\":123,\"preview\":" + gcode + "}";
    }

    // --- tiny JSON readers (flat top-level fields only) ---------------------
    private static String extractString(String json, String key) {
        var m = java.util.regex.Pattern
                .compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json);
        return m.find() ? m.group(1) : null;
    }
    private static long extractLong(String json, String key) {
        var m = java.util.regex.Pattern
                .compile("\"" + key + "\"\\s*:\\s*(-?\\d+)").matcher(json);
        return m.find() ? Long.parseLong(m.group(1)) : 0L;
    }
    private static List<String> extractStringArray(String json, String key) {
        List<String> out = new ArrayList<>();
        int keyPos = json.indexOf("\"" + key + "\"");
        if (keyPos < 0) return out;
        int i = json.indexOf('[', keyPos);
        if (i < 0) return out;
        i++;
        while (i < json.length()) {
            while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
            if (i >= json.length() || json.charAt(i) == ']') break;
            if (json.charAt(i) != '"') break;
            StringBuilder s = new StringBuilder();
            i++;
            boolean esc = false;
            while (i < json.length()) {
                char c = json.charAt(i++);
                if (esc) {
                    s.append(switch (c) {
                        case 'n' -> '\n';
                        case 'r' -> '\r';
                        case 't' -> '\t';
                        case '\\' -> '\\';
                        case '"' -> '"';
                        default -> c;
                    });
                    esc = false;
                } else if (c == '\\') {
                    esc = true;
                } else if (c == '"') {
                    break;
                } else {
                    s.append(c);
                }
            }
            out.add(s.toString());
            while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
            if (i < json.length() && json.charAt(i) == ',') i++;
        }
        return out;
    }
    private static String jsonArray(List<String> values) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) b.append(',');
            b.append('"').append(esc(values.get(i))).append('"');
        }
        return b.append(']').toString();
    }
    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }
}
