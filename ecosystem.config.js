module.exports = {
  apps: [
    {
      name: "blast-server",
      script: "index.js",
      cwd: "/home/ubuntu/Documents/deal-maker/server",
      env: {
        PORT: 5004,
        DISPLAY: ":99",
      },
      interpreter: "node",
      exec_mode: "fork",
    },
  ],
};
