# Use an official Node.js runtime as a parent image
FROM mcr.microsoft.com/playwright:v1.54.2-jammy

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Your app binds to port 5000, so expose it
EXPOSE 5000

# Define the command to run your app
CMD ["node", "server.cjs"]