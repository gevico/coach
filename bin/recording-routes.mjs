import express from 'express';

export function recordingRoutes(recorder) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const host = new URL(`http://${request.get('host') || 'invalid'}`);
    const origin = request.get('origin');
    const site = request.get('sec-fetch-site');
    if (!['127.0.0.1', 'localhost'].includes(host.hostname) || Number(host.port) !== request.socket.localPort
      || (origin && origin !== host.origin) || (site && !['same-origin', 'none'].includes(site))) {
      response.status(403).json({ error: '录制请求需要来自当前 Coach 网页。' });
      return;
    }
    request.coachOrigin = host.origin;
    next();
  });
  router.get('/', (_request, response) => response.json(recorder.snapshot()));
  router.use(express.json({ limit: '2kb' }));
  router.use((request, response, next) => {
    if (request.get('x-coach-recording-token') !== recorder.token) {
      response.status(403).json({ error: '录制请求已失效，请重新加载页面。' });
      return;
    }
    next();
  });
  router.post('/start', async (request, response) => {
    try {
      if (typeof request.body?.microphone !== 'boolean') throw new Error('请指定是否录制麦克风。');
      response.json(await recorder.start({ pageOrigin: request.coachOrigin, microphone: request.body.microphone }));
    } catch (error) { response.status(400).json({ ...recorder.snapshot(), error: error.message }); }
  });
  router.post('/stop', async (_request, response) => {
    try { response.json(await recorder.stop()); } catch (error) { response.status(400).json({ error: error.message }); }
  });
  router.post('/open', async (_request, response) => {
    try { await recorder.openMovie(); response.json(recorder.snapshot()); } catch (error) { response.status(400).json({ error: error.message }); }
  });
  router.post('/directory', async (request, response) => {
    try { response.json(await recorder.configureDirectory(request.body?.directory)); }
    catch (error) { response.status(400).json({ error: error.message }); }
  });
  router.post('/choose-directory', async (_request, response) => {
    try { response.json(await recorder.configureDirectory(undefined, true)); }
    catch (error) { response.status(400).json({ error: error.message }); }
  });
  router.post('/open-directory', async (_request, response) => {
    try { await recorder.openDirectory(); response.json(recorder.snapshot()); }
    catch (error) { response.status(400).json({ error: error.message }); }
  });
  return router;
}
