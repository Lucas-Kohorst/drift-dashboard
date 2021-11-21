FROM node:latest
WORKDIR /
COPY . .
RUN yarn
COPY . .
RUN yarn add typescript -g
CMD ["npx", "ts-node", "./exporter.ts"]