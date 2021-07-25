FROM node:14
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package.json /usr/src/app/
RUN npm install
COPY . /usr/src/app
EXPOSE 3000
RUN npm -v
RUN node -v
RUN cat package.json
CMD [ "npm", "run", "prod-start" ]