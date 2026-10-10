interface AndroidDownloadBridge {
  receiveBlob?: (name: string, base64: string, mode: string) => void;
}

export async function download(blob: Blob, name: string): Promise<void> {
  const android = (window as Window & { CashbookAndroid?: AndroidDownloadBridge }).CashbookAndroid;
  if (android) {
    if (typeof android.receiveBlob !== 'function') {
      throw new Error('This installed Android app needs an update to save downloads.');
    }
    // Convert in the page, then send completed bytes to Android's Downloads
    // writer. Do not rely on WebView evaluating a Promise or a synthetic click.
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result.split(',')[1] : undefined;
        if (result) resolve(result);
        else reject(new Error('Could not prepare the download. Please try again.'));
      };
      reader.onerror = () => reject(new Error('Could not read the download. Please try again.'));
      reader.onabort = () => reject(new Error('Download preparation was interrupted. Please try again.'));
      reader.readAsDataURL(blob);
    });
    android.receiveBlob(name, base64, 'download');
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
