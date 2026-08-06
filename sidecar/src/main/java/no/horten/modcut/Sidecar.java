package no.horten.modcut;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

/** Line-delimited JSON-RPC entry point used by Electron. */
public final class Sidecar {
  private static final ObjectMapper JSON = new ObjectMapper();

  private Sidecar() {}

  public static void main(String[] args) throws Exception {
    var controller = new MachineController(JSON);
    Runtime.getRuntime().addShutdownHook(new Thread(controller::close));
    var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    var out = new PrintWriter(System.out, true, StandardCharsets.UTF_8);
    System.err.printf("[modCut sidecar] ready (M1, Java %s)%n", System.getProperty("java.version"));

    String line;
    while ((line = in.readLine()) != null) {
      if (line.isBlank()) continue;
      JsonNode request = null;
      try {
        request = JSON.readTree(line);
        long id = request.path("id").asLong();
        String method = request.path("method").asText("");
        JsonNode result = controller.handle(method, request.path("params"));
        ObjectNode response = JSON.createObjectNode();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.set("result", result);
        out.println(JSON.writeValueAsString(response));
      } catch (Exception error) {
        ObjectNode response = JSON.createObjectNode();
        response.put("jsonrpc", "2.0");
        response.put("id", request == null ? 0 : request.path("id").asLong());
        ObjectNode rpcError = response.putObject("error");
        rpcError.put("code", error instanceof IllegalArgumentException ? -32602 : -32603);
        rpcError.put("message", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
        out.println(JSON.writeValueAsString(response));
      }
    }
    controller.close();
  }
}
