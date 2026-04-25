#!/bin/bash
set -euo pipefail

PUMP_IP="${PUMP_IP:?PUMP_IP not set}"
ROUTER_IP="${ROUTER_IP:-192.168.0.1}"
IFACE="${IFACE:-eth1}"
DURATION="${DURATION:-1800}"
MITM_PORT="${MITM_PORT:-8181}"
CAPTURE_DIR="/captures"
TIMESTAMP=$(date +%s)

echo "[+] nirvana-capture starting (headless)"
echo "    Pump:      $PUMP_IP"
echo "    Router:    $ROUTER_IP"
echo "    Iface:     $IFACE"
echo "    MITM port: $MITM_PORT"
echo "    Duration:  ${DURATION}s"

echo 1 > /proc/sys/net/ipv4/ip_forward
echo "[+] IP forwarding enabled"

arpspoof -i "$IFACE" -t "$PUMP_IP" "$ROUTER_IP" > "$CAPTURE_DIR/arpspoof1.log" 2>&1 &
ARPSPOOF_PID1=$!
arpspoof -i "$IFACE" -t "$ROUTER_IP" "$PUMP_IP" > "$CAPTURE_DIR/arpspoof2.log" 2>&1 &
ARPSPOOF_PID2=$!
echo "[+] ARP spoofing started (PIDs: $ARPSPOOF_PID1 $ARPSPOOF_PID2)"

MITM_ENABLED=false
if iptables-legacy -t nat -A PREROUTING -s "$PUMP_IP" -p tcp --dport 80 -j REDIRECT --to-port "$MITM_PORT" 2>/dev/null && \
   iptables-legacy -t nat -A PREROUTING -s "$PUMP_IP" -p tcp --dport 443 -j REDIRECT --to-port "$MITM_PORT" 2>/dev/null; then
    echo "[+] iptables-legacy redirect active (HTTP/HTTPS to mitmproxy:$MITM_PORT)"
    MITM_ENABLED=true
else
    echo "[!] iptables redirect failed -- mitmproxy intercept disabled; raw pcap only"
fi

tcpdump -i "$IFACE" host "$PUMP_IP" -w "$CAPTURE_DIR/nirvana-${TIMESTAMP}.pcap" > /dev/null 2>&1 &
TCPDUMP_PID=$!
echo "[+] tcpdump PID: $TCPDUMP_PID"

MITMDUMP_PID=0
if [ "$MITM_ENABLED" = true ]; then
    mitmdump --mode transparent --listen-port "$MITM_PORT" --save-stream-file "$CAPTURE_DIR/nirvana-${TIMESTAMP}.mitm" > "$CAPTURE_DIR/mitmdump-${TIMESTAMP}.log" 2>&1 &
    MITMDUMP_PID=$!
    echo "[+] mitmdump PID: $MITMDUMP_PID"
fi

echo "$ARPSPOOF_PID1 $ARPSPOOF_PID2 $TCPDUMP_PID $MITMDUMP_PID" > "$CAPTURE_DIR/capture.pids"
echo "[+] All processes running. Capturing for ${DURATION}s..."

sleep "$DURATION"
echo "[+] Duration reached, running cleanup"
bash /app/cleanup.sh
