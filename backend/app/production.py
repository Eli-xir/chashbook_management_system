"""Small-office, single-process edge protections behind the HTTPS proxy."""
import time
from collections import OrderedDict, deque

from fastapi.responses import JSONResponse

from .config import settings

_attempts = OrderedDict()


async def protect(request, call_next):
    if settings.env != 'local':
        origin = request.headers.get('origin')
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and origin and origin not in settings.cors_origin_list:
            return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
        if request.method == 'POST' and request.url.path.startswith('/auth/'):
            key = request.client.host if request.client else 'unknown'
            now = time.monotonic()
            times = _attempts.setdefault(key, deque())
            _attempts.move_to_end(key)
            while times and times[0] < now - 60:
                times.popleft()
            if len(times) >= 15:
                return JSONResponse({'detail': 'Too many attempts. Wait a minute.'}, status_code=429,
                                    headers={'Retry-After': '60'})
            times.append(now)
            if len(_attempts) > 10000:
                _attempts.popitem(last=False)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if request.url.path.startswith(('/auth', '/transactions', '/users')):
        response.headers['Cache-Control'] = 'no-store'
    return response
