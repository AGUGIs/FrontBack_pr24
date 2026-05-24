FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV HTTP_ONLY=true
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "app.js"]
