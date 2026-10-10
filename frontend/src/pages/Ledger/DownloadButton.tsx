import { useState } from 'react';
import { download, needsSavePicker } from './fileDownload';

export function DownloadButton({ file, disabled = false, label = 'Download' }: {
  file: File | null; disabled?: boolean; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picker = needsSavePicker();

  async function save() {
    if (!file || disabled || busy) return;
    setBusy(true); setError('');
    try { await download(file, file.name); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the file. Try again.'); }
    finally { setBusy(false); }
  }

  return <div className="flex-col gap-sm">
    <button type="button" className="btn" disabled={!file || disabled || busy} onClick={() => void save()}>
      {busy ? 'Preparing save…' : label}
    </button>
    {picker && <span className="hint">Choose a Files or storage app from the Android chooser to save.
      If no save option is available, download in your browser or update the Android app.</span>}
    {error && <span role="alert" className="text-error">{error}</span>}
  </div>;
}
