# Stage 1: build the static site with Node
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite bakes this into the JS at build time. Empty = call /api on the same origin; nginx proxies it.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: serve the built files with nginx
FROM nginx:1.29-alpine
# The image's start-up script turns templates/*.template into conf.d/*, filling in the AUTH_RATE_* settings.
# The filter keeps it from touching anything else. Defaults are high for local Docker and the test suites;
# deploy/compose.prod.yml sets the real limits.
ENV NGINX_ENVSUBST_FILTER=^AUTH_RATE_ \
    AUTH_RATE_LIMIT=6000r/m \
    AUTH_RATE_BURST=1000
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
