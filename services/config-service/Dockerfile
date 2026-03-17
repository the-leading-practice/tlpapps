FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/
RUN npm install
RUN npx tsc && cp -R config/ dist/

FROM node:20-alpine
WORKDIR /usr/src/app
COPY --from=builder /build/dist/ ./
COPY --from=builder /build/config/ ./config/
COPY package.json ./
RUN npm install --omit=dev
ENV NODE_PATH=/usr/src/app
EXPOSE 5650
CMD ["node", "app.js"]
