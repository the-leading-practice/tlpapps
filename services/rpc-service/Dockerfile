# Common build stage
FROM node:19-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app
COPY ./dist /usr/src/app

RUN npm install

EXPOSE 5599

CMD [ "node", "app.js" ]

