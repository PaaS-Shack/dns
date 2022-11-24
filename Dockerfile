FROM node:17-alpine

WORKDIR /usr/src/app

RUN apk update
RUN apk add git

COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

COPY . .

CMD [ "node", "agent.js" ]