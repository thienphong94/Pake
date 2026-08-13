import { describe, expect, it } from 'vitest';

import { appendBundleResource } from '../../bin/helpers/merge';

describe('appendBundleResource', () => {
  it('preserves existing resources while adding the icon once', () => {
    const bundle = {
      resources: ['extensions/browser-extension'],
    } as Parameters<typeof appendBundleResource>[0];

    appendBundleResource(bundle, 'png/YouTube_256.ico');
    appendBundleResource(bundle, 'png/YouTube_256.ico');

    expect(bundle.resources).toEqual([
      'extensions/browser-extension',
      'png/YouTube_256.ico',
    ]);
  });
});
