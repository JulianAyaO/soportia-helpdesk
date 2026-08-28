FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/certs
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/99-self-cert.sh /docker-entrypoint.d/99-self-cert.sh
RUN chmod +x /docker-entrypoint.d/99-self-cert.sh
COPY --from=build /workspace/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80 443
