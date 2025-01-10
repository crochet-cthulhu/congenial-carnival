FROM node:22-alpine
#ENV NODE_ENV=production

WORKDIR /congenial-carnival

COPY ["package.json", "yarn.lock", "./"]
RUN corepack enable
RUN yarn install
RUN yarn cache clean
COPY . .

CMD [ "yarn", "start" ]
