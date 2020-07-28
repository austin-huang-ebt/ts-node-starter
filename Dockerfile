# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#cmd

FROM node:12-alpine 

RUN apk add --no-cache tini

RUN mkdir /home/node/app/ && chown -R node:node /home/node/app

WORKDIR /home/node/app

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

USER node

COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

RUN npm install -g -s --no-progress yarn@1.22.4 && \
  yarn && \
  yarn run build-ts && \
  yarn cache clean

COPY --chown=node:node . .

EXPOSE 3000

# Tini is now available at /sbin/tini
ENTRYPOINT ["/sbin/tini", "--"]

# Don’t Use Process Managers In Production. Except for local development, don’t wrap your node startup commands with anything. Don’t use npm, nodemon, etc.
CMD [ "node", "dist/server.js"]
