FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server

EXPOSE 8080

CMD ["npm", "start"]
