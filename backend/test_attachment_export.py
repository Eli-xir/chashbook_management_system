import io
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from botocore.exceptions import ClientError
import storage
from main import download_attachment


class AttachmentExportTests(unittest.TestCase):
    row = {'attachment_url': 'attatchments/images/receipt.png', 'content_type': 'image/png', 'original_name': 'receipt.png'}

    def test_export_returns_private_bytes_without_redirect_and_closes_body(self):
        body = io.BytesIO(b'image bytes')
        client = Mock()
        client.get_object.return_value = {'Body': body}
        with patch.object(storage, 'BUCKET', 'test-bucket'), patch.object(storage, 's3', return_value=client):
            response = storage.response(self.row, export=True)
        self.assertEqual(response.body, b'image bytes')
        self.assertNotIn('location', response.headers)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertTrue(body.closed)
        client.generate_presigned_url.assert_not_called()

    def test_normal_view_keeps_presigned_redirect(self):
        client = Mock()
        client.generate_presigned_url.return_value = 'https://example.test/private'
        with patch.object(storage, 'BUCKET', 'test-bucket'), patch.object(storage, 's3', return_value=client):
            response = storage.response(self.row)
        self.assertEqual(response.status_code, 307)
        client.get_object.assert_not_called()

    def test_missing_object_has_useful_error(self):
        client = Mock()
        client.get_object.side_effect = ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
        with patch.object(storage, 'BUCKET', 'test-bucket'), patch.object(storage, 's3', return_value=client):
            with self.assertRaises(HTTPException) as caught:
                storage.response(self.row, export=True)
        self.assertEqual(caught.exception.status_code, 404)

    def test_export_cannot_bypass_attachment_permissions(self):
        db = Mock()
        db.execute.return_value.fetchone.side_effect = [self.row, None]
        with patch('main.user_permissions', return_value=[]), patch.object(storage, 'response') as response:
            with self.assertRaises(HTTPException):
                download_attachment(42, db, {'user_role_id': 2, 'user_id': 'other-user'}, export=True)
            response.assert_not_called()


if __name__ == '__main__':
    unittest.main()
