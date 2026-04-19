// All features require unit + integration tests before a task is marked complete.

describe('MCP server integration', () => {
  test.todo('list_devices tool returns device list when credentials are valid');
  test.todo('get_status tool returns formatted status for a real device');
  test.todo('set_mode tool sends correct payload for POOL, SPA, and OFF');
  test.todo('set_temperature tool sends correct card_id and value');
});
