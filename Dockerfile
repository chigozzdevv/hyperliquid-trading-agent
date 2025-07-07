FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .
COPY .env.docker .env

EXPOSE 8080

CMD ["pnpm", "run", "dev"]