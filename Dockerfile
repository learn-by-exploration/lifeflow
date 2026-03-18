FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY public/ ./public/
RUN mkdir -p /app/data
ENV DB_DIR=/app/data
EXPOSE 3456
CMD ["node", "src/server.js"]
