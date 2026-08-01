import { loadConfig } from './config/index.js';
import { buildApp } from './app.js';

async function main() {
  const config = loadConfig();
  const { app, logger } = await buildApp(config);

  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info('server_started', {
    port: config.PORT,
    host: config.HOST,
    speechProvider: config.SPEECH_PROVIDER,
    translationProvider: config.TRANSLATION_PROVIDER,
    retranscribeProvider: config.RETRANSCRIBE_PROVIDER,
    transcriptCorrectionEnabled: config.TRANSCRIPT_CORRECTION_ENABLED,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
