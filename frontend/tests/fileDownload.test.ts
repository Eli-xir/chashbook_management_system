import { test } from 'node:test';
import assert from 'node:assert/strict';
import { download, needsSavePicker } from '../src/pages/Ledger/fileDownload.ts';

function globals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

class BlobReader {
  result = '';
  onload = () => {};
  onerror = () => {};
  onabort = () => {};
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((bytes) => {
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
      this.onload();
    });
  }
}

test('Android downloads send complete binary data directly without the broken blob-URL path', async (t) => {
  const received = [];
  globals(t, {
    window: { CashbookAndroid: {
      receiveBlob: (...args) => received.push(args),
      handleBlob: () => assert.fail('Must not ask Android to fetch a blob URL'),
      shareFile: () => assert.fail('Direct native saving must take priority'),
    } },
    FileReader: BlobReader,
  });
  assert.equal(needsSavePicker(), false);
  for (const [name, type] of [['receipts.pdf', 'application/pdf'], ['ledger.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['ledger.csv', 'text/csv']]) {
    const bytes = Buffer.from([0, 255, 128, 13, 10, 65]);
    const count = received.length;
    const pending = download(new Blob([bytes], { type }), name);
    assert.equal(received.length, count, 'The native bridge must wait for conversion');
    await pending;
    assert.deepEqual(received[count], [name, bytes.toString('base64'), 'download']);
  }
});

test('legacy APKs use their working chooser instead of silently failing downloads', async (t) => {
  const shared = [];
  globals(t, {
    window: { CashbookAndroid: {
      handleBlob: () => assert.fail('Legacy blob download is broken'),
      shareFile: (...args) => shared.push(args),
    } },
    FileReader: BlobReader,
  });
  assert.equal(needsSavePicker(), true);
  const pending = download(new Blob(['%PDF-test'], { type: 'application/pdf' }), 'attachments.pdf');
  assert.equal(shared.length, 0);
  await pending;
  assert.deepEqual(shared, [['attachments.pdf', Buffer.from('%PDF-test').toString('base64'), 'application/pdf']]);
});

test('file conversion errors reject without sending incomplete data to Android', async (t) => {
  globals(t, {
    window: { CashbookAndroid: { receiveBlob: () => assert.fail('Must not send unreadable data') } },
    FileReader: class extends BlobReader {
      readAsDataURL() { queueMicrotask(() => this.onerror()); }
    },
  });
  await assert.rejects(download(new Blob(['file']), 'report.pdf'), /Could not read/);
});

test('APKs without a usable native method report an actionable error', async (t) => {
  globals(t, { window: { CashbookAndroid: {} } });
  await assert.rejects(download(new Blob(['file']), 'report.pdf'), /Update the app/);
});

test('desktop downloads keep the filename, use the active dialog and release the URL later', async (t) => {
  const events = [];
  const link = { href: '', download: '', click() { events.push('click'); }, remove() { events.push('remove'); } };
  globals(t, {
    window: {},
    document: {
      createElement: () => link,
      querySelectorAll: () => [
        { appendChild: () => assert.fail('Use the top dialog') },
        { appendChild: (child) => { assert.equal(child, link); events.push('append'); } },
      ],
      body: { appendChild: () => assert.fail('Do not append to the inert page') },
    },
    setTimeout: (callback, delay) => { assert.equal(delay, 60000); events.push(callback); },
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:test');
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  assert.equal(needsSavePicker(), false);
  await download(new Blob(['file']), 'attachments.pdf');
  assert.equal(link.href, 'blob:test');
  assert.equal(link.download, 'attachments.pdf');
  assert.deepEqual(events.slice(0, 3), ['append', 'click', 'remove']);
  assert.equal(revoke.mock.callCount(), 0);
  events[3]();
  assert.equal(revoke.mock.calls[0].arguments[0], 'blob:test');
});
