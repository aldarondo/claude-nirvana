#!/bin/bash

PUMP_IP="${PUMP_IP:-}"
CAPTURE_DIR="/captures"

echo "[+] nirvana-capture cleanup starting..."

# Remove iptables rules
if [ -n "$PUMP_IP" ]; then
    iptables -t nat -D PREROUTING -s "$PUMP_IP" -p tcp --dport 80  -j REDIRECT --to-port 8080 2>/dev/null || true
    iptables -t nat -D PREROUTING -s "$PUMP_IP" -p tcp --dport 443 -j REDIRECT --to-port 8080 2>/dev/null || true
    echo "[+] iptables rules removed"
fi

# Kill capture processes
if [ -f "$CAPTURE_DIR/capture.pids" ]; then
    # shellcheck disable=SC2046
    kill $(cat "$CAPTURE_DIR/capture.pids") 2>/dev/null || true
    rm -f "$CAPTURE_DIR/capture.pids"
    echo "[+] Capture processes stopped"
fi

# Restore IP forwarding
echo 0 > /proc/sys/net/ipv4/ip_forward
echo "[+] IP forwarding disabled"

echo ""
echo "[+] Cleanup complete. Capture files:"
ls -lh "$CAPTURE_DIR/"*.pcap "$CAPTURE_DIR/"*.mitm 2>/dev/null || echo "    (none found)"
echo ""
echo "Next: copy files from NAS /volume1/docker/nirvana-capture/captures/ and analyze with Wireshark / mitmproxy."
