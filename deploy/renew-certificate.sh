#!/usr/bin/env bash
set -euo pipefail

# Hanya memperbarui sertifikat milik SIAPIN pada penyimpanan Certbot existing.
docker run --rm \
  -v /opt/manris/certbot/www:/var/www/certbot \
  -v /opt/manris/certbot/conf:/etc/letsencrypt \
  certbot/certbot:v3.3.0 renew \
  --cert-name siapin.dikalaksana.com --non-interactive --no-directory-hooks "$@"

docker exec nginx nginx -t
docker exec nginx nginx -s reload
