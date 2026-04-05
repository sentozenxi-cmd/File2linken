import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startBot } from "./bot/index.js";
import { getGramjsClient } from "./lib/gramjsClient.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await startBot();
  } catch (botErr) {
    logger.error({ err: botErr }, "Failed to start Telegram bot");
  }

  try {
    await getGramjsClient();
  } catch (gramErr) {
    logger.error({ err: gramErr }, "Failed to initialize MTProto client — stream/download will fail");
  }
});

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
