# ---------- Build stage ----------
FROM node:20 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir -p /app/data
VOLUME /app/data
EXPOSE 8787
# Set a stable secret so sessions survive restarts:
# docker run -e JWT_SECRET="your-long-random-secret" ...
CMD ["npx", "tsx", "server/index.ts"]
