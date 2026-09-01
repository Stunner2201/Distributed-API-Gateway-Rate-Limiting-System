# Backend Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY index.js ./

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "index.js"]

