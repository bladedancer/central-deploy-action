FROM mhart/alpine-node:13

LABEL repository="https://github.com/bladedancer/central-deploy-action"
LABEL maintainer="Gavin Matthews"

COPY . /action
ENTRYPOINT ["node", "/action/src/main.js"]
