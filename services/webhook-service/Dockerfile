# Common build stage
FROM node:20-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app
COPY ./dist /usr/src/app

RUN npm install
ENV NODE_PATH=/usr/src/app

EXPOSE 5670

CMD [ "node", "app.js" ]
