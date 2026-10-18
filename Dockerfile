# Imagen para publicar Puente Solidario en cualquier proveedor que acepte Docker.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY server ./server
COPY public ./public
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3737 \
    TRUST_PROXY=1
VOLUME ["/data"]
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
