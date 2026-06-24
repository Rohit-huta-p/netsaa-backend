FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/

EXPOSE 5005

CMD ["node", "dist/server.js"]
