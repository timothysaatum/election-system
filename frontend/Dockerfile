FROM node:18-alpine as build

WORKDIR /app

# Accept build arguments
ARG REACT_APP_API_URL=/api
ARG NODE_ENV=production
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    NODE_ENV=$NODE_ENV \
    GENERATE_SOURCEMAP=false

# Copy package files
COPY package*.json ./

# Install ALL dependencies and fix ajv conflict
RUN npm install --legacy-peer-deps && \
    npm install ajv@^8.0.0 --save-dev --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove source maps for security (if build folder exists)
RUN find build -name "*.map" -type f -delete 2>/dev/null || true

# Production stage with Nginx
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

# Set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port (changed from 8080 to 80 for simplicity)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:80/healthcheck || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]