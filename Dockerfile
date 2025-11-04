# Use Apify's base image for Playwright with Chrome
FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm --quiet set progress=false \
    && npm install --only=production --no-optional \
    && echo "Installed NPM packages:" \
    && (npm list --depth=0 || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy source code
COPY . ./

# Run the Actor
CMD npm start

