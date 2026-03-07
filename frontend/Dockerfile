FROM node:18-alpine as build

WORKDIR /app

# Accept build arguments
ARG REACT_APP_API_URL=/api
ARG NODE_ENV=production
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    NODE_ENV=$NODE_ENV \
    GENERATE_SOURCEMAP=false

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies with pnpm
# --frozen-lockfile ensures exact versions
RUN pnpm install --frozen-lockfile

# Fix ajv conflict if needed
RUN pnpm add -D ajv@^8.0.0

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Remove source maps for security (if build folder exists)
RUN find build -name "*.map" -type f -delete 2>/dev/null || true

# ── Production Stage ───────────────────────────────────────
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default nginx config and files
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy built files from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configurations
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# Set permissions on static files
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Pre-create cache/log directories with proper permissions
RUN mkdir -p \
    /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /var/log/nginx \
    /var/run && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/run && \
    chmod -R 755 /var/cache/nginx

# Upload volume mount point — read-only at runtime
RUN mkdir -p /usr/share/nginx/uploads

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:80/healthcheck || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]