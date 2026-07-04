import { mux, MUX_ASSET_SETTINGS, playbackUrl, posterUrl } from '../config/mux';

it('constructs the client and builds Mux URLs', () => {
  expect(mux).toBeDefined();
  expect(playbackUrl('pb_1')).toBe('https://stream.mux.com/pb_1.m3u8');
  expect(posterUrl('pb_1')).toBe('https://image.mux.com/pb_1/thumbnail.jpg?time=1');
});

it('MUX_ASSET_SETTINGS is accepted by uploads.create params type', () => {
  // Compile-time check only (never called): if this type-errors, tsc fails.
  const _params: Parameters<typeof mux.video.uploads.create>[0] = {
    cors_origin: '*',
    new_asset_settings: { ...MUX_ASSET_SETTINGS },
  };
  expect(_params.new_asset_settings).toBeDefined();
});
