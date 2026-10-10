interface AndroidFiles {
  receiveBlob?: (name: string, base64: string, mode: string) => void;
  shareFile?: (name: string, base64: string, mime: string) => void;
}

declare global {
  interface Window { CashbookAndroid?: AndroidFiles; }
}

export function needsSavePicker() {
  const native = window.CashbookAndroid;
  return !!native && typeof native.receiveBlob !== 'function';
}

function base64File(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result.split(',')[1] : undefined;
      if (data) resolve(data);
      else reject(new Error('Could not prepare the file for saving.'));
    };
    reader.onerror = () => reject(new Error('Could not read the file for saving.'));
    reader.onabort = () => reject(new Error('File preparation was interrupted. Try again.'));
    reader.readAsDataURL(blob);
  });
}

export async function download(blob: Blob, name: string): Promise<void> {
  const native = window.CashbookAndroid;
  if (native) {
    // Send completed bytes directly. Older APKs cannot resolve an asynchronous
    // blob fetch through evaluateJavascript's return-value callback.
    if (typeof native.receiveBlob === 'function') {
      native.receiveBlob(name, await base64File(blob), 'download');
      return;
    }
    if (typeof native.shareFile === 'function') {
      // The installed legacy APK exposes no working direct-save method.
      // Its working file chooser lets a storage app save the completed file.
      native.shareFile(name, await base64File(blob), blob.type || 'application/octet-stream');
      return;
    }
    throw new Error('This Android app cannot save files. Update the app or download from your browser.');
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  // Keep the link inside the active modal rather than the inert page behind it.
  const dialogs = document.querySelectorAll('dialog[open]');
  const parent = dialogs[dialogs.length - 1] ?? document.body;
  try {
    parent.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
