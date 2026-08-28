#!/bin/sh
set -e
mkdir -p /etc/nginx/certs /usr/share/nginx/html
SAN="DNS:localhost,DNS:soportia.local,IP:127.0.0.1"
if [ -n "$TLS_IP" ]; then
  SAN="$SAN,IP:$TLS_IP"
fi
openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/nginx/certs/self.key \
  -out /etc/nginx/certs/self.crt \
  -subj "/CN=Soportia" \
  -addext "subjectAltName=$SAN"
cp /etc/nginx/certs/self.crt /usr/share/nginx/html/soportia.crt
chmod 644 /usr/share/nginx/html/soportia.crt
echo "Soportia TLS SAN=$SAN"
