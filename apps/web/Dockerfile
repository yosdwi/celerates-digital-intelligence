FROM node:22-alpine AS build
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build
FROM nginx:1.27-alpine
ENV PORT=80 API_UPSTREAM=http://intelligence-api:8000
COPY apps/web/docker-entrypoint.d/15-cdi-resolver.envsh /docker-entrypoint.d/15-cdi-resolver.envsh
RUN chmod +x /docker-entrypoint.d/15-cdi-resolver.envsh
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
