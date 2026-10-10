import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { download } from '../src/pages/Ledger/downloadFile.ts';

function replaceGlobal(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}

class BlobReader {
  result = '';
  onload = () => {};
  onerror = () => {};
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((bytes) => {
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
      this.onload();
    });
  }
}

test('Android Download sends complete bytes directly to Downloads, never Share or blob navigation', async (t) => {
  const calls: unknown[][] = [];
  replaceGlobal(t, 'window', { CashbookAndroid: {
    receiveBlob: (...args: unknown[]) => calls.push(args),
    shareFile: () => assert.fail('Download must never open Share'),
    handleBlob: () => assert.fail('Download must not round-trip through blob navigation'),
  } });
  replaceGlobal(t, 'FileReader', BlobReader);
  t.mock.method(URL, 'createObjectURL', () => { throw new Error('Android must not create a download link'); });
  const bytes = new Uint8Array([0, 37, 80, 68, 70, 128, 255]);
  const pending = download(new Blob([bytes], { type: 'application/pdf' }), 'attachments.pdf');
  assert.equal(calls.length, 0, 'Wait until conversion finishes');
  await pending;
  assert.deepEqual(calls, [['attachments.pdf', Buffer.from(bytes).toString('base64'), 'download']]);
});

test('an old APK never substitutes sharing for downloading', async (t) => {
  replaceGlobal(t, 'window', { CashbookAndroid: {
    shareFile: () => assert.fail('Download must never open Share'),
    handleBlob: () => assert.fail('Do not use the known broken handler'),
  } });
  await assert.rejects(download(new Blob(['file']), 'file.pdf'), /installed Android app needs an update/);
});

test('conversion errors are reported without sending incomplete files', async (t) => {
  replaceGlobal(t, 'window', { CashbookAndroid: {
    receiveBlob: () => assert.fail('No incomplete file should reach Android'),
  } });
  replaceGlobal(t, 'FileReader', class extends BlobReader {
    readAsDataURL() { queueMicrotask(() => this.onerror()); }
  });
  await assert.rejects(download(new Blob(['file']), 'file.pdf'), /Could not read/);
});

test('browser downloads preserve the filename and keep the URL alive until consumption', async (t) => {
  const events: string[] = [];
  let release = () => {};
  const anchor = { href: '', download: '', click: () => events.push('click'), remove: () => events.push('remove') };
  replaceGlobal(t, 'window', {});
  replaceGlobal(t, 'document', {
    createElement: () => anchor,
    body: { appendChild: () => events.push('append') },
  });
  replaceGlobal(t, 'setTimeout', (callback: () => void, delay: number) => {
    assert.equal(delay, 60000);
    release = callback;
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:download-test');
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  await download(new Blob(['file']), 'ledger.csv');
  assert.deepEqual(events, ['append', 'click', 'remove']);
  assert.equal(anchor.href, 'blob:download-test');
  assert.equal(anchor.download, 'ledger.csv');
  assert.equal(revoke.mock.callCount(), 0);
  release();
  assert.deepEqual(revoke.mock.calls[0].arguments, ['blob:download-test']);
});
