import http from "node:http";

// Container health probe. Exits rather than calling process.exit() so the socket
// can close cleanly; `agent: false` keeps no keep-alive socket behind, so the
// process ends as soon as the response is consumed.
const port = Number(process.env.PORT ?? 3000);

const request = http.get(
  { host: "127.0.0.1", port, path: "/login", agent: false, timeout: 4000 },
  (response) => {
    response.resume();
    response.on("end", () => {
      process.exitCode = response.statusCode === 200 ? 0 : 1;
    });
  },
);

request.on("error", () => {
  process.exitCode = 1;
});

request.on("timeout", () => {
  request.destroy();
});
