# Stage 1: Build the React SPA
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve with ultra-lightweight Nginx Alpine
FROM nginx:alpine

# The small built-in Node HTTPS proxy validates and pins destination addresses.
RUN apk add --no-cache nodejs ca-certificates
WORKDIR /opt/magistri
COPY server/proxy.mjs server/school-directory.mjs server/start.mjs /opt/magistri/server/
COPY deploy/proxy-security.conf /etc/nginx/proxy-security.conf

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["node", "/opt/magistri/server/start.mjs"]
