FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json tsconfig.json ./
COPY src/ ./src/
RUN npm install
RUN npx tsc

FROM node:20-alpine
WORKDIR /usr/src/app
COPY --from=builder /build/dist/ ./
COPY package.json ./
RUN npm install --omit=dev
ENV NODE_PATH=/usr/src/app
EXPOSE 9101
CMD ["node", "app.js"]
