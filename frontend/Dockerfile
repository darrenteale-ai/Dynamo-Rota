# Vite bakes VITE_API_URL into the built JS at build time, not at container start time.
# If your backend URL changes, you must rebuild this image with a new build arg — see README.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["sh", "-c", "serve -s dist -l ${PORT:-5173}"]
