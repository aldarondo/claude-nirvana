FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    dsniff \
    tcpdump \
    mitmproxy \
    iptables \
    iproute2 \
    iputils-ping \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY capture.sh cleanup.sh ./
RUN chmod +x capture.sh cleanup.sh

VOLUME /captures

CMD ["bash", "/app/capture.sh"]
