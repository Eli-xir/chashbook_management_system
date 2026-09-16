import io

import boto3
import pytest
from botocore.stub import ANY, Stubber
from fastapi import HTTPException, UploadFile

from app import storage
from app.config import settings
from app.main import app
from app import production
import httpx


@pytest.fixture
def private_s3(monkeypatch):
    client = boto3.client('s3', region_name='ap-south-1',
                          aws_access_key_id='test-only', aws_secret_access_key='test-only')
    monkeypatch.setattr(settings, 'storage_backend', 's3')
    monkeypatch.setattr(settings, 's3_bucket', 'cashbook-test-private')
    monkeypatch.setattr(storage, 's3_client', lambda: client)
    with Stubber(client) as stub:
        yield client, stub
        stub.assert_no_pending_responses()


async def test_s3_upload_is_private_and_uses_detected_type(private_s3):
    _, stub = private_s3
    data = b'\x89PNG\r\n\x1a\n' + b'example'
    stub.add_response('put_object', {}, {
        'Bucket': 'cashbook-test-private', 'Key': ANY, 'Body': data,
        'ContentType': 'image/png', 'ServerSideEncryption': 'AES256',
        'CacheControl': 'private, no-store',
    })
    result = await storage.save_upload(UploadFile(io.BytesIO(data), filename='untrusted.exe'), 'image')
    assert result['object_name'].startswith('images/')
    assert result['object_name'].endswith('.png')
    assert result['content_type'] == 'image/png'


def test_s3_download_signed_only_after_authorized_route(private_s3, monkeypatch):
    client, _ = private_s3
    captured = {}
    def sign(operation, **kwargs):
        captured.update(operation=operation, **kwargs)
        return 'https://private.example/signed'
    monkeypatch.setattr(client, 'generate_presigned_url', sign)
    result = storage.stored_response('images/' + 'a' * 32 + '.png')
    assert result.status_code == 307
    assert result.headers['cache-control'] == 'private, no-store'
    assert captured['ExpiresIn'] == 60
    assert captured['Params']['Bucket'] == 'cashbook-test-private'
    with pytest.raises(HTTPException):
        storage.stored_response('../secrets')


def test_s3_delete_targets_only_valid_object(private_s3):
    _, stub = private_s3
    key = 'voice/' + 'b' * 32 + '.ogg'
    stub.add_response('delete_object', {}, {'Bucket': 'cashbook-test-private', 'Key': key})
    storage.delete_stored(key)


async def test_production_origin_guard(monkeypatch):
    monkeypatch.setattr(settings, 'env', 'production')
    monkeypatch.setattr(settings, 'cors_origins', 'https://cashbook.example.com')
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='https://cashbook.example.com') as client:
        response = await client.post('/auth/login', headers={'Origin': 'https://attacker.example'},
                                     json={'username': 'test', 'password': 'wrong'})
    assert response.status_code == 403


async def test_production_auth_throttle(monkeypatch):
    monkeypatch.setattr(settings, 'env', 'production')
    production._attempts.clear()
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='https://cashbook.example.com') as client:
            for _ in range(15):
                await client.post('/auth/login', json={})
            response = await client.post('/auth/login', json={})
        assert response.status_code == 429
        assert response.headers['retry-after'] == '60'
    finally:
        production._attempts.clear()
