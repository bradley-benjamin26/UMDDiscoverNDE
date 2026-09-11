FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./backend

USER node
EXPOSE 4300

CMD ["node", "backend/server.mjs"]