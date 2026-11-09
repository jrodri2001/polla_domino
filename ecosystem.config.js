module.exports = {
  apps: [
    {
      name: "polla-domino",
      script: "node_modules/.bin/next",
      args: "start -p 3005",
      cwd: "/Users/jrodri/Projects/polla",
      env: {
        NODE_ENV: "production",
        PORT: 3005,
      },
      restart_delay: 2000,
      max_restarts: 10,
    },
  ],
};
