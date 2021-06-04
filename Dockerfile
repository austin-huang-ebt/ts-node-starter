FROM node:12-alpine AS builder

RUN mkdir /home/node/app/

WORKDIR /home/node/app

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

COPY package.json ./
COPY yarn.lock ./

RUN yarn

COPY . .

RUN yarn run build-ts

# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#cmd

FROM node:12-alpine 

RUN apk add --no-cache tini

RUN mkdir /home/node/app/ && chown -R node:node /home/node/app

WORKDIR /home/node/app

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

USER node
RUN yarn
RUN yarn cache clean

COPY --chown=node:node --from=builder /home/node/app/dist/ ./dist/
COPY --chown=node:node ./.env ./.env 

EXPOSE 3000

# Tini is now available at /sbin/tini
ENTRYPOINT ["/sbin/tini", "--"]

# Don’t Use Process Managers In Production. Except for local development, don’t wrap your node startup commands with anything. Don’t use npm, nodemon, etc.
CMD [ "node", "dist/server.js"]
