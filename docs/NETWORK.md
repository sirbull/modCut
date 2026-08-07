# Connect a GRBL laser on the local network

modCut supports a raw GRBL command stream over TCP. This is the same basic
pattern used by VisiCut/LibLaserCut for IP-based G-code devices: configure a
hostname, open a TCP connection and verify that the expected controller answers
before sending a job.

The default port is **23**, which is commonly the Telnet/raw G-code port. The
laser controller's browser interface, often on port 80 or 443, is not the same
protocol and cannot be used as the raw command port.

## Configure the machine

1. Connect the computer and laser controller to the same trusted LAN or Wi-Fi.
2. In modCut, open **Machine → Manage machines → Add machine**.
3. Select **Grbl** as the driver.
4. Select **Network (Ethernet / Wi-Fi)**.
5. Enter the controller's IP address or local hostname, for example
   `192.168.1.50` or `fluidnc.local`.
6. Enter its raw GRBL/Telnet port. Start with `23` unless the controller is
   configured differently.
7. Enter the physical bed size. If the controller has a tested Z axis, open
   Advanced, enable Z and enter its relative minimum/maximum travel, a safe Z
   feed and any small global Z/focus correction required by that machine. Leave
   it disabled for machines without controlled Z focusing.
8. Save the profile.

Keep **Dry run** enabled for the first editor and toolpath test. To verify the
real network connection, make the laser safe, disable **Dry run**, and click
**Connect**.

## What Connect verifies

Opening a TCP port alone is not considered a successful laser connection.
modCut sends GRBL's real-time `?` status query, which does not move an axis or
enable the laser, and requires a valid `<State|...>` response (or a recognizable
GRBL/FluidNC banner). The verified controller state is shown beside the
connection address.

The connection uses TCP keepalive and `TCP_NODELAY`. Every G-code line must
receive GRBL's `ok`; `error` and `alarm` responses stop the job. A timeout or
broken socket marks the machine disconnected and triggers the existing
emergency-stop path.

## Troubleshooting

- **Host not found:** verify the hostname or use the numeric IP address. A
  `.local` name requires mDNS support on the computer and controller.
- **No TCP service:** check the controller's raw/Telnet port, power, VLAN/guest
  Wi-Fi isolation and local firewall.
- **Port answers but is not GRBL:** the configured port may be the HTTP web UI,
  SSH or another service. Select the raw G-code/Telnet port instead.
- **Commands time out:** another sender may already control the laser, Wi-Fi may
  be unstable, or the controller timeout may be too short. Advanced machine
  settings expose connect/handshake and command-response timeouts.

Do not expose the raw GRBL port directly to the internet. Keep it on a trusted
local network, and retain a reachable physical emergency stop during testing.

## Current protocol scope

Network execution currently supports GRBL-compatible raw TCP streams, including
controllers or bridges that return standard GRBL status and `ok` responses.
Epilog, Ruida, LAOS/TFTP, HTTP upload and WebSocket protocols require separate
drivers and are not treated as interchangeable with GRBL/TCP.
