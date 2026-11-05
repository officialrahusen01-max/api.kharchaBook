FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src

RUN mkdir -p /app/uploads/profile-photos && chown -R node:node /app/uploads

USER node
EXPOSE 8000

CMD ["node", "server.js"]
