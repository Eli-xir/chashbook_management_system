"""Upload a completed backup archive using the server's restricted AWS identity."""
import os
import sys
from pathlib import Path

from .storage import s3_client
from .config import settings


if __name__ == '__main__':
    archive = Path(sys.argv[1])
    bucket = os.environ['CASHBOOK_BACKUP_BUCKET']
    s3_client().upload_file(str(archive), bucket, settings.backup_prefix.strip('/') + '/' + archive.name,
                            ExtraArgs={'ServerSideEncryption': 'AES256'})
    print('Backup uploaded successfully.')
