FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY proxy.js ./

# Generate self-signed cert for nirvana.iot-endpoint.com at build time
# The pump likely does not verify server certs (common in IoT devices).
# If it does, we'll see TLS handshake failures in the logs — switch to Phase 2B.
RUN mkdir -p /certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout /certs/server.key \
      -out /certs/server.crt \
      -subj "/CN=nirvana.iot-endpoint.com" \
      -addext "subjectAltName=DNS:nirvana.iot-endpoint.com"

EXPOSE 8443
EXPOSE 8088

CMD ["node", "proxy.js"]
