# Use the official Microsoft Playwright image which includes all browser dependencies
FROM mcr.microsoft.com/playwright:v1.54.2-jammy

# --- THIS IS THE CRUCIAL LINE TO ADD ---
# Sets the environment variable to 'production' inside the container.
# This ensures our code knows it's running in production and won't try to load a .env file.
ENV NODE_ENV production

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Your app binds to port 5000, so expose it
# Note: Render ignores this for web services but it's good practice.
EXPOSE 5000

# Define the command to run your app
CMD ["node", "server.cjs"]
