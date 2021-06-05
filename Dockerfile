FROM node:12-alpine AS builder

RUN mkdir /home/node/app/

WORKDIR /home/node/app

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

COPY ./package.json ./

RUN npm install

COPY ./tsconfig.json ./
COPY ./src/ ./src/

RUN npm run build-ts
RUN npm prune --production


FROM gcr.io/distroless/nodejs:12

WORKDIR /app

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY package.json ./

COPY --from=builder /home/node/app/node_modules/ ./node_modules/
COPY --from=builder /home/node/app/dist/ ./dist/
COPY ./.env ./ 

EXPOSE 3000

CMD [ "dist/server.js"]
