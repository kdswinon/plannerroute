exports.handler = async event => {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const q = String(event.queryStringParameters?.query || '').trim();
  if (q.length > 200) {
    return { statusCode: 400, headers, body: JSON.stringify({ error_type: 'bad_request', message: '검색어가 너무 깁니다.' }) };
  }
  if (!q) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error_type: 'bad_request', message: 'query 파라미터가 필요합니다.' })
    };
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error_type: 'missing_key', message: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.' })
    };
  }

  try {
    const authHeader = { Authorization: 'KakaoAK ' + key };

    // 1차: 주소 검색 (도로명/지번)
    let res = await fetch('https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(q), {
      headers: authHeader
    });

    if (!res.ok) {
      const errType = res.status === 401 || res.status === 403 ? 'auth_error' : 'server_error';
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({
          error_type: errType,
          message: errType === 'auth_error'
            ? `카카오 API 인증 실패 (HTTP ${res.status}): API 키를 확인해주세요.`
            : `카카오 API 호출 실패 (HTTP ${res.status})`
        })
      };
    }

    let data = await res.json();

    // 2차: 주소 결과가 없으면 장소/키워드 검색 시도
    if (!data.documents || data.documents.length === 0) {
      const kRes = await fetch('https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent(q), {
        headers: authHeader
      });
      if (kRes.ok) {
        const kData = await kRes.json();
        if (kData.documents && kData.documents.length > 0) {
          data = kData;
        }
      }
    }

    if (!data.documents || data.documents.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ error_type: 'not_found', documents: [], message: '일치하는 주소 또는 장소를 찾을 수 없습니다.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error_type: 'server_error', message: '서버 통신 오류: ' + (err.message || '요청 실패') })
    };
  }
};
